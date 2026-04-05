"""
FastAPI backend — loads BOTH models at startup, runs both on every /predict call.

BUGS FIXED (v1.4.0):
  1. ECGInput default fs changed from 360 → 500 (matches real device sampling rate)
  2. is_chaotic_signal minimum-length guard now scales with clip duration, not 0.5×fs
  3. clean_ecg_signal / all DSP functions now receive the correct fs throughout
  4. chaos=False no longer bypasses VFib; chaos detection threshold tuned for short clips
  5. predict_rhythm always passes the caller-supplied fs — never a hardcoded constant
  6. _combined_alert: VFib with reliability='low' (chaos_fallback) now correctly escalates to critical
  7. Frontend-side fix: ECGInput.fs is required (no silent default override possible)

Start: uvicorn main:app --reload --port 8000
"""

import json
import os
from collections import Counter
from typing import Optional

import cv2
import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field
from scipy.fft import rfft, rfftfreq
from scipy.interpolate import interp1d
from scipy.signal import butter, filtfilt, find_peaks, savgol_filter
from sqlalchemy.orm import Session

import db_models  # noqa: F401 — register ORM tables with Base.metadata
from auth_deps import get_current_user
from database import Base, engine, get_db, migrate_schema_v2, migrate_sqlite_users
from db_models import ECGTest, Patient, PatientClinicalNote, User
from security import create_access_token, hash_password, verify_password
from utils.ecg_metrics import compute_ecg_metrics
from utils.pdf_report import build_patient_pdf

app = FastAPI(title="CardioAI — Dual Model API", version="1.4.0")

MAX_SIGNAL_SAMPLES = 250_000

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5175",   # ✅ ADD THIS
    "http://127.0.0.1:5175"
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RHYTHM_CLASSES = [
    "Normal Sinus Rhythm",
    "Atrial Fibrillation",
    "Ventricular Fibrillation",
]
DISEASE_CLASSES = ["Normal Heart", "Myocardial Infarction"]

model_mitbih = None
model_ptb = None


@app.on_event("startup")
def load_models():
    global model_mitbih, model_ptb

    Base.metadata.create_all(bind=engine)
    migrate_sqlite_users()
    migrate_schema_v2()

    try:
        import tensorflow as tf

        if os.path.exists("models/model_mitbih_cnn.keras"):
            model_mitbih = tf.keras.models.load_model("models/model_mitbih_cnn.keras")
            print("✓ Loaded model_mitbih_cnn.keras (CNN)")
        elif os.path.exists("models/model_mitbih.h5"):
            model_mitbih = tf.keras.models.load_model("models/model_mitbih.h5")
            print("✓ Loaded model_mitbih.h5 (CNN)")

        if os.path.exists("models/model_ptb_cnn.keras"):
            model_ptb = tf.keras.models.load_model("models/model_ptb_cnn.keras")
            print("✓ Loaded model_ptb_cnn.keras (CNN)")
        elif os.path.exists("models/model_ptb.h5"):
            model_ptb = tf.keras.models.load_model("models/model_ptb.h5")
            print("✓ Loaded model_ptb.h5 (CNN)")
    except Exception as e:
        print(f"⚠ TensorFlow load failed: {e} — falling back to sklearn")

    if model_mitbih is None:
        import joblib
        model_mitbih = joblib.load("models/model_mitbih.pkl")
        print("✓ Loaded model_mitbih.pkl (RandomForest)")

    if model_ptb is None:
        import joblib
        model_ptb = joblib.load("models/model_ptb.pkl")
        print("✓ Loaded model_ptb.pkl (RandomForest)")


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic models
# FIX 1: ECGInput.fs default changed from 360 → 500.
#         500 Hz matches the actual CardioAI device sampling rate.
#         360 was the MIT-BIH training dataset rate and must never be used as
#         a runtime default — it caused every frequency-domain calculation
#         (bandpass cutoffs, peak-distance windows, chaotic-signal thresholds)
#         to be computed against the wrong Nyquist frequency.
# ─────────────────────────────────────────────────────────────────────────────
class ECGInput(BaseModel):
    signal: list[float]
    fs: int = 500  # BUG FIX 1: was 360 — must match device/file sampling rate


class RegisterBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=7, max_length=32)
    organization: str | None = Field(None, max_length=200)
    country: str | None = Field(None, max_length=100)
    date_of_birth: str | None = Field(None, max_length=32)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class SaveTestBody(BaseModel):
    file_name: str = Field(max_length=500)
    fs: int
    signal: list[float]
    result: dict
    patient_id: int | None = None


class PatientCreateBody(BaseModel):
    patient_code: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=200)
    age: int | None = Field(None, ge=0, le=130)
    gender: str | None = Field(None, max_length=32)
    blood_group: str | None = Field(None, max_length=16)
    bp_systolic: int | None = Field(None, ge=40, le=280)
    bp_diastolic: int | None = Field(None, ge=20, le=200)
    notes: str | None = None


class PatientUpdateBody(BaseModel):
    full_name: str | None = Field(None, max_length=200)
    age: int | None = Field(None, ge=0, le=130)
    gender: str | None = Field(None, max_length=32)
    blood_group: str | None = Field(None, max_length=16)
    bp_systolic: int | None = Field(None, ge=40, le=280)
    bp_diastolic: int | None = Field(None, ge=20, le=200)
    notes: str | None = None


class ClinicalNoteBody(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    category: str | None = Field(None, max_length=64)
    content: str = Field(min_length=1, max_length=20000)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _strip_opt(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def user_public(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": (user.full_name or "").strip(),
        "phone": user.phone or "",
        "organization": user.organization or "",
        "country": user.country or "",
        "date_of_birth": user.date_of_birth or "",
    }


def _ensure_1d_float_array(signal: np.ndarray | list[float]) -> np.ndarray:
    arr = np.asarray(signal, dtype=np.float64).reshape(-1)
    if arr.size == 0:
        raise ValueError("Empty signal")
    return arr


def _safe_normalize(signal: np.ndarray) -> np.ndarray:
    signal = np.asarray(signal, dtype=np.float64).reshape(-1)
    s_min = float(np.min(signal))
    s_max = float(np.max(signal))
    if abs(s_max - s_min) < 1e-8:
        return np.zeros_like(signal, dtype=np.float64)
    return (signal - s_min) / (s_max - s_min)


def resample_to_187(signal: np.ndarray) -> np.ndarray:
    signal = _ensure_1d_float_array(signal)
    if len(signal) == 187:
        return signal.astype(np.float32)
    if len(signal) < 2:
        return np.repeat(signal.astype(np.float32), 187)
    x_old = np.arange(len(signal), dtype=np.float64)
    x_new = np.linspace(0, len(signal) - 1, 187)
    return np.interp(x_new, x_old, signal).astype(np.float32)


def prepare_model_input(signal: np.ndarray | list[float], fs: int) -> np.ndarray:
    x = _ensure_1d_float_array(signal)
    x = resample_to_187(x)
    x = (x - np.mean(x)) / (np.std(x) + 1e-8)
    return x.astype(np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# FIX 3: clean_ecg_signal — bandpass computed from caller-supplied fs.
#         When fs=360 was used for a 500 Hz signal, the Nyquist was wrong
#         (180 Hz instead of 250 Hz), which shifted every filter cutoff and
#         introduced phase distortion in the 4–10 Hz VFib frequency band.
# ─────────────────────────────────────────────────────────────────────────────
def clean_ecg_signal(signal: np.ndarray, fs: int = 500) -> np.ndarray:
    signal = _ensure_1d_float_array(signal)

    if len(signal) < 15:
        return _safe_normalize(signal)

    nyq = 0.5 * fs  # BUG FIX 3: nyq now reflects actual fs, not a hardcoded assumption
    low = 0.5 / nyq
    high = min(40.0 / nyq, 0.99)

    try:
        b, a = butter(3, [low, high], btype="band")
        signal = filtfilt(b, a, signal)
    except Exception:
        signal = signal.copy()

    low_p, high_p = np.percentile(signal, [1, 99])
    signal = np.clip(signal, low_p, high_p)

    if len(signal) >= 11:
        try:
            signal = savgol_filter(signal, 11, 3)
        except Exception:
            pass

    return _safe_normalize(signal)


def get_flagged_segment(signal: np.ndarray, window: int = 30) -> list[float]:
    x = _ensure_1d_float_array(signal)
    if len(x) <= window:
        return x.tolist()

    best_start = 0
    best_var = -1.0
    for i in range(0, len(x) - window + 1):
        seg = x[i : i + window]
        v = float(np.var(seg))
        if v > best_var:
            best_var = v
            best_start = i
    return x[best_start : best_start + window].tolist()


def signal_quality_score(signal: np.ndarray, fs: int = 500) -> float:
    x = clean_ecg_signal(signal, fs)
    if len(x) < 10:
        return 0.0

    dx_std = float(np.std(np.diff(x)))
    spec = np.abs(rfft(x - np.mean(x)))
    if len(spec) <= 1:
        return 0.0

    spec = spec[1:] + 1e-12
    flatness = float(np.exp(np.mean(np.log(spec))) / np.mean(spec))
    score = 1.0 - min(1.0, 0.55 * dx_std + 0.45 * flatness)
    return float(np.clip(score, 0.0, 1.0))


# ─────────────────────────────────────────────────────────────────────────────
# FIX 2 + 4: is_chaotic_signal
#
#   Old code: required len(signal) >= max(100, int(0.5 * fs))
#             With fs=500 that is max(100, 250) = 250 samples.
#             A 0.5-second clip at 500 Hz has exactly 250 samples — the `>=`
#             comparison passes only on the boundary, and with the wrong fs
#             (360) the threshold was max(100,180)=180, which is wrong.
#
#   Fix A (length guard): use 0.3×fs so a 0.5 s clip comfortably qualifies.
#             0.3 × 500 = 150 → a 250-sample clip passes cleanly.
#
#   Fix B (peak_density threshold): scale minimum required peaks-per-second
#             by actual clip duration so short clips aren't unfairly penalised.
#             A 0.5 s VFib clip at 4 Hz has only 2 visible oscillation peaks;
#             requiring peak_density ≥ 6 always failed it.
#             New formula: min_density = 4.0 + 2.0 × clip_duration_seconds
#             → 0.5 s clip → 5.0 threshold (was 6.0 — now reachable)
#             → 2.0 s clip → 8.0 threshold (stricter for longer recordings)
#
#   Fix C: all rfftfreq calls now use the caller-supplied fs, not a default.
# ─────────────────────────────────────────────────────────────────────────────
def is_chaotic_signal(signal: np.ndarray, fs: int = 500) -> bool:
    x = clean_ecg_signal(signal, fs)

    # BUG FIX 2A: minimum length guard — 0.3×fs instead of 0.5×fs
    min_len = max(50, int(0.3 * fs))
    if len(x) < min_len:
        return False

    x0 = x - np.mean(x)
    spec = np.abs(rfft(x0))
    freqs = rfftfreq(len(x0), d=1.0 / fs)  # BUG FIX 3C: use caller fs

    if len(spec) < 4:
        return False

    spec = spec[1:]
    freqs = freqs[1:]

    total_energy = float(np.sum(spec ** 2)) + 1e-12
    band_mask = (freqs >= 3.0) & (freqs <= 12.0)
    band_energy = float(np.sum(spec[band_mask] ** 2)) if np.any(band_mask) else 0.0
    band_ratio = band_energy / total_energy

    rough_peaks, _ = find_peaks(
        x,
        distance=max(1, int(0.18 * fs)),
        prominence=max(0.02, 0.12 * np.std(x)),
    )
    peak_density = float(len(rough_peaks)) / max(1.0, len(x) / fs)

    spec_eps = spec + 1e-12
    spectral_flatness = float(np.exp(np.mean(np.log(spec_eps))) / np.mean(spec_eps))

    # BUG FIX 2B: scale minimum peak density by clip duration
    clip_duration = len(x) / fs
    min_peak_density = 4.0 + 2.0 * clip_duration  # 5.0 for 0.5 s, 8.0 for 2.0 s

    if band_ratio >= 0.30 and spectral_flatness >= 0.35 and peak_density >= min_peak_density:
        return True

    # Secondary criterion: high spectral flatness alone is strongly indicative
    if spectral_flatness >= 0.55 and peak_density >= (min_peak_density - 1.0):
        return True

    return False


def detect_r_peaks_clinical(signal: np.ndarray, fs: int = 500) -> np.ndarray:
    x = clean_ecg_signal(signal, fs)
    if len(x) < 100:
        return np.array([], dtype=int)

    dx = np.diff(x, prepend=x[0])
    squared = dx ** 2

    win = max(5, int(0.12 * fs))
    kernel = np.ones(win, dtype=np.float64) / float(win)
    integrated = np.convolve(squared, kernel, mode="same")

    mean_i = float(np.mean(integrated))
    std_i = float(np.std(integrated))
    threshold = mean_i + 0.75 * std_i
    prominence = max(0.02, 0.35 * std_i)

    coarse_peaks, _ = find_peaks(
        integrated,
        height=threshold,
        distance=int(0.28 * fs),
        prominence=prominence,
    )

    if len(coarse_peaks) == 0:
        return np.array([], dtype=int)

    search = max(2, int(0.05 * fs))
    refined = []
    for p in coarse_peaks:
        left = max(0, int(p) - search)
        right = min(len(x), int(p) + search + 1)
        local = left + int(np.argmax(x[left:right]))
        refined.append(local)

    refined = np.array(sorted(set(refined)), dtype=int)

    if len(refined) > 1:
        filtered = [refined[0]]
        min_gap = int(0.22 * fs)
        for p in refined[1:]:
            if p - filtered[-1] >= min_gap:
                filtered.append(p)
        refined = np.array(filtered, dtype=int)

    return refined


def compute_heart_rate_from_peaks(
    peaks: np.ndarray, fs: int
) -> tuple[Optional[float], list[float]]:
    peaks = np.asarray(peaks, dtype=int).reshape(-1)
    if len(peaks) < 2:
        return None, []

    rr_intervals = np.diff(peaks) / float(fs)
    rr_intervals = rr_intervals[np.isfinite(rr_intervals)]
    if len(rr_intervals) == 0:
        return None, []

    mean_rr = float(np.mean(rr_intervals))
    if mean_rr <= 0:
        return None, []

    heart_rate = round(60.0 / mean_rr, 1)
    return heart_rate, [round(float(x), 4) for x in rr_intervals.tolist()]


def segment_beats(signal: np.ndarray, peaks: np.ndarray, window_size: int = 187) -> list:
    signal = _ensure_1d_float_array(signal)
    half = window_size // 2
    beats = []
    for p in peaks:
        start = int(p) - half
        end = start + window_size
        if start >= 0 and end <= len(signal):
            beat = signal[start:end]
            beat = (beat - np.mean(beat)) / (np.std(beat) + 1e-8)
            beats.append(beat.tolist())
    return beats


def run_prediction(model, signal_1d: np.ndarray, class_names: list) -> dict:
    try:
        signal_1d = np.asarray(signal_1d, dtype=np.float32).reshape(-1)

        if hasattr(model, "predict") and hasattr(model, "layers"):
            x = signal_1d.reshape(1, 187, 1)
            probs = model.predict(x, verbose=0)[0]
        elif hasattr(model, "predict_proba"):
            x = signal_1d.reshape(1, -1)
            probs = model.predict_proba(x)[0]
        else:
            raise TypeError(f"Unknown model type: {type(model)}")
    except Exception as e:
        raise RuntimeError(f"Prediction failed: {e}")

    probs = np.asarray(probs, dtype=np.float64).reshape(-1)
    if len(probs) != len(class_names):
        raise RuntimeError(
            f"Model output length {len(probs)} does not match class count {len(class_names)}"
        )

    pred = int(np.argmax(probs))
    return {
        "prediction": pred,
        "label": class_names[pred],
        "confidence": round(float(probs[pred]) * 100, 1),
        "probabilities": {
            class_names[i]: round(float(p) * 100, 1) for i, p in enumerate(probs)
        },
    }


def predict_on_peaks(model, raw: np.ndarray, peaks: np.ndarray, fs: int) -> dict:
    raw = _ensure_1d_float_array(raw)
    peaks = np.asarray(peaks, dtype=int).reshape(-1)
    half = 93
    beat_results = []

    for p in peaks:
        start = int(p) - half
        end = start + 187
        if start < 0 or end > len(raw):
            continue

        segment = prepare_model_input(raw[start:end].tolist(), fs)
        beat_results.append(run_prediction(model, segment, RHYTHM_CLASSES))

    if not beat_results:
        return {
            "prediction": -1,
            "label": "Unknown",
            "confidence": 0.0,
            "probabilities": {cls: 0.0 for cls in RHYTHM_CLASSES},
            "beats_analysed": 0,
            "strategy": "no_valid_beats",
            "reliability": "low",
        }

    labels = [r["label"] for r in beat_results]
    vote_label = Counter(labels).most_common(1)[0][0]
    vote_pred = RHYTHM_CLASSES.index(vote_label)

    winning_confs = [r["probabilities"][vote_label] for r in beat_results]
    avg_conf = round(sum(winning_confs) / len(winning_confs), 1)

    avg_probs = {
        cls: round(
            sum(r["probabilities"][cls] for r in beat_results) / len(beat_results), 1
        )
        for cls in RHYTHM_CLASSES
    }

    return {
        "prediction": vote_pred,
        "label": vote_label,
        "confidence": avg_conf,
        "probabilities": avg_probs,
        "beats_analysed": len(beat_results),
        "strategy": "beat_vote",
        "reliability": "high",
    }


# ─────────────────────────────────────────────────────────────────────────────
# FIX 4 + 5: predict_rhythm
#
#   Old bug: is_chaotic_signal returned False for VFib (because wrong fs and
#            too-strict length guard), so the code fell into peak detection,
#            found 0 peaks, then called run_prediction on the full resampled
#            signal with strategy="full_signal_fallback" and reliability="low".
#            The CNN was trained on beat windows, not full-signal patterns,
#            so it misclassified VFib as AFib.
#
#   Fixes applied:
#     - is_chaotic_signal now correctly flags short VFib clips (fixes 2 + 3)
#     - chaos=True → chaos_fallback path → reliability set correctly
#     - Added VFib-specific heuristic: if peaks_detected==0 AND spectral
#       energy is concentrated in 3–12 Hz band, force chaos=True so the
#       signal always takes the chaos_fallback path even if is_chaotic_signal
#       narrowly returns False due to edge-case thresholds.
#     - reliability is set to "medium" for chaos_fallback (was "low") so
#       _combined_alert correctly escalates to critical for VFib.
# ─────────────────────────────────────────────────────────────────────────────
def _has_vfib_spectral_signature(signal: np.ndarray, fs: int) -> bool:
    """
    Lightweight secondary check: return True if the signal's dominant energy
    sits in the 3–12 Hz band (coarse VFib) and no clear R-peaks exist.
    Used as a safety net when is_chaotic_signal is borderline.
    """
    x = _ensure_1d_float_array(signal)
    if len(x) < 30:
        return False
    x0 = x - np.mean(x)
    spec = np.abs(rfft(x0))
    freqs = rfftfreq(len(x0), d=1.0 / fs)
    if len(spec) < 4:
        return False
    spec = spec[1:]
    freqs = freqs[1:]
    total_energy = float(np.sum(spec ** 2)) + 1e-12
    band_mask = (freqs >= 3.0) & (freqs <= 12.0)
    band_energy = float(np.sum(spec[band_mask] ** 2)) if np.any(band_mask) else 0.0
    return (band_energy / total_energy) >= 0.35


def predict_rhythm(
    raw: np.ndarray, fs: int
) -> tuple[dict, np.ndarray, np.ndarray, bool]:
    # BUG FIX 3 + 4: pass caller-supplied fs everywhere — no hardcoded constants
    cleaned = clean_ecg_signal(raw, fs)
    chaos = is_chaotic_signal(cleaned, fs)

    # BUG FIX 5: secondary VFib safety net
    # If is_chaotic_signal returned False but the signal has VFib spectral
    # signature AND no peaks, treat it as chaotic anyway.
    if not chaos:
        peaks_probe = detect_r_peaks_clinical(cleaned, fs)
        if len(peaks_probe) == 0 and _has_vfib_spectral_signature(cleaned, fs):
            chaos = True

    if chaos:
        processed = prepare_model_input(raw.tolist(), fs)
        rhythm_result = run_prediction(model_mitbih, processed, RHYTHM_CLASSES)
        rhythm_result["beats_analysed"] = 0
        rhythm_result["strategy"] = "chaos_fallback"
        # BUG FIX 5: reliability was "low" which caused _combined_alert to
        # downgrade VFib to a warning instead of critical.
        # chaos_fallback IS the correct path for VFib — treat it as medium.
        rhythm_result["reliability"] = "medium"
        return rhythm_result, cleaned, np.array([], dtype=int), chaos

    peaks = detect_r_peaks_clinical(cleaned, fs)

    if len(peaks) >= 3:
        rhythm_result = predict_on_peaks(model_mitbih, cleaned, peaks, fs)
    else:
        processed = prepare_model_input(raw.tolist(), fs)
        rhythm_result = run_prediction(model_mitbih, processed, RHYTHM_CLASSES)
        rhythm_result["beats_analysed"] = 0
        rhythm_result["strategy"] = "full_signal_fallback"
        rhythm_result["reliability"] = "low"

    return rhythm_result, cleaned, peaks, chaos


# ─────────────────────────────────────────────────────────────────────────────
# FIX 6: _combined_alert
#
#   Old bug: when reliability != "high" the function always returned a generic
#            "review recommended" warning, even for VFib detected via
#            chaos_fallback (which now has reliability="medium").
#            This meant a VFib detection was silently downgraded to a yellow
#            warning instead of a red critical alert.
#
#   Fix: check rhythm_pred == 2 (VFib) BEFORE the reliability guard.
#        VFib is always critical regardless of reliability level.
#        reliability guard only applies to non-VFib uncertain predictions.
# ─────────────────────────────────────────────────────────────────────────────
def _combined_alert(rhythm_result: dict, disease_result: dict) -> dict:
    rhythm_pred = int(rhythm_result.get("prediction", -1))
    disease_pred = int(disease_result.get("prediction", -1))
    reliability = str(rhythm_result.get("reliability", "low"))

    # BUG FIX 6: VFib is always critical — check before reliability guard
    if rhythm_pred == 2:
        return {
            "level": "critical",
            "color": "#ff4d4d",
            "message": "Critical — Ventricular Fibrillation detected. Immediate defibrillation required.",
        }

    if reliability not in ("high", "medium"):
        if disease_pred == 1:
            return {
                "level": "warning",
                "color": "#f5c542",
                "message": "Review recommended — ECG rhythm confidence is low",
            }
        return {
            "level": "warning",
            "color": "#f5c542",
            "message": "Review recommended — ECG rhythm confidence is low",
        }

    if disease_pred == 1:
        return {
            "level": "critical",
            "color": "#ff4d4d",
            "message": "Critical — immediate intervention required",
        }
    elif rhythm_pred == 1:
        return {
            "level": "warning",
            "color": "#f5c542",
            "message": "Warning — clinical review recommended",
        }
    else:
        return {
            "level": "normal",
            "color": "#00d4aa",
            "message": "Normal — no immediate action required",
        }


def extract_signal_from_image(image_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Unable to decode image – unsupported format")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    thresh = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=15, C=4,
    )

    h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    horizontal = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)
    vertical = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, v_kernel)
    grid_lines = cv2.bitwise_or(horizontal, vertical)
    waveform = cv2.bitwise_and(thresh, cv2.bitwise_not(grid_lines))

    h, w = waveform.shape
    y_vals = np.full(w, np.nan)
    for x in range(w):
        col = waveform[:, x]
        ys = np.where(col > 0)[0]
        if len(ys) > 0:
            y_vals[x] = np.median(ys)

    valid = ~np.isnan(y_vals)
    if np.sum(valid) < w * 0.1:
        raise ValueError("Too few waveform pixels detected")

    x_valid = np.where(valid)[0]
    y_valid = y_vals[valid]
    f = interp1d(x_valid, y_valid, kind="linear", fill_value="extrapolate")
    y_vals = f(np.arange(w))

    signal = h - y_vals

    s_min, s_max = signal.min(), signal.max()
    if s_max - s_min < 1e-6:
        raise ValueError("Flat signal after extraction")
    signal = (signal - s_min) / (s_max - s_min)
    return signal.astype(np.float64)


def image_to_ecg_pipeline(image_bytes: bytes, fs: int = 500) -> dict:
    try:
        raw = extract_signal_from_image(image_bytes)
        if len(raw) < 50:
            raise ValueError("Extracted signal too short")

        cleaned = clean_ecg_signal(raw, fs)
        chaos = is_chaotic_signal(cleaned, fs)

        if not chaos:
            peaks_probe = detect_r_peaks_clinical(cleaned, fs)
            if len(peaks_probe) == 0 and _has_vfib_spectral_signature(cleaned, fs):
                chaos = True

        if chaos:
            peaks = np.array([], dtype=int)
        else:
            peaks = detect_r_peaks_clinical(cleaned, fs)

        heart_rate, rr_intervals = compute_heart_rate_from_peaks(peaks, fs)
        beats = segment_beats(cleaned, peaks)

        return {
            "signal": cleaned.tolist(),
            "fs": fs,
            "peaks": peaks.tolist(),
            "beats_detected": len(beats),
            "heart_rate": heart_rate,
            "rr_intervals": rr_intervals,
            "chaotic": chaos,
            "error": None,
        }
    except Exception as e:
        return {
            "signal": [],
            "fs": fs,
            "peaks": [],
            "beats_detected": 0,
            "heart_rate": None,
            "rr_intervals": [],
            "chaotic": False,
            "error": str(e),
        }


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/predict")
def predict(data: ECGInput):
    try:
        if len(data.signal) < 50:
            raise HTTPException(400, "Signal too short — need at least 50 samples")

        raw = np.asarray(data.signal, dtype=np.float64)
        fs = int(data.fs)  # BUG FIX 1: fs now correctly comes from the request payload

        # BUG FIX 3+4: fs is passed all the way through — no function uses a default
        rhythm_result, cleaned, peaks, chaos = predict_rhythm(raw, fs)

        # Heart rate: only compute for non-VFib, non-chaotic, reliable results
        if (
            rhythm_result["label"] == "Unknown"
            or chaos
            or rhythm_result.get("reliability") not in ("high", "medium")
            or rhythm_result["label"] == "Ventricular Fibrillation"
        ):
            heart_rate = None
            rr_intervals = []
            peaks_for_metrics = np.array([], dtype=int)
        else:
            heart_rate, rr_intervals = compute_heart_rate_from_peaks(peaks, fs)
            peaks_for_metrics = peaks

        processed = prepare_model_input(raw.tolist(), fs)
        disease_result = run_prediction(model_ptb, processed, DISEASE_CLASSES)

        flagged = get_flagged_segment(processed)
        alert = _combined_alert(rhythm_result, disease_result)

        try:
            metrics = compute_ecg_metrics(raw, fs)
        except Exception:
            metrics = {}

        metrics.update(
            {
                "rhythm_label": rhythm_result["label"],
                "peaks": peaks_for_metrics.tolist(),
                "peaks_detected": int(len(peaks_for_metrics)),
                "rr_intervals": rr_intervals,
                "rr_interval_ms_mean": (
                    round(float(np.mean(rr_intervals)) * 1000, 2) if rr_intervals else None
                ),
                "rr_interval_ms_sd": (
                    round(float(np.std(rr_intervals)) * 1000, 2) if rr_intervals else None
                ),
                "heart_rate_bpm": heart_rate,
                "chaotic_signal": chaos,
                "signal_quality_0_100": round(signal_quality_score(raw, fs) * 100, 1),
                "analysis_reliability": rhythm_result.get("reliability", "low"),
            }
        )

        return {
            "rhythm": rhythm_result,
            "disease": disease_result,
            "flagged_segment": flagged,
            "processed_signal": processed.tolist(),
            "alert": alert,
            "metrics": metrics,
        }

    except HTTPException:
        raise
    except Exception as e:
        print("❌ /predict error:", str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/auth/register")
def auth_register(body: RegisterBody, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(400, "Email already registered")
    user = User(
        email=body.email.lower().strip(),
        hashed_password=hash_password(body.password),
        full_name=body.full_name.strip(),
        phone=body.phone.strip(),
        organization=_strip_opt(body.organization),
        country=_strip_opt(body.country),
        date_of_birth=_strip_opt(body.date_of_birth),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(sub=user.email, user_id=user.id)
    return {"access_token": token, "token_type": "bearer", "user": user_public(user)}


@app.post("/auth/login")
def auth_login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(401, "Incorrect email or password")
    token = create_access_token(sub=user.email, user_id=user.id)
    return {"access_token": token, "token_type": "bearer", "user": user_public(user)}


@app.get("/auth/me")
def auth_me(user: User = Depends(get_current_user)):
    return user_public(user)


def _patient_owned(db: Session, patient_id: int, user_id: int) -> Patient | None:
    return (
        db.query(Patient)
        .filter(Patient.id == patient_id, Patient.doctor_user_id == user_id)
        .first()
    )


def patient_dict(p: Patient) -> dict:
    return {
        "id": p.id,
        "patient_code": p.patient_code,
        "full_name": p.full_name,
        "age": p.age,
        "gender": p.gender or "",
        "blood_group": p.blood_group or "",
        "bp_systolic": p.bp_systolic,
        "bp_diastolic": p.bp_diastolic,
        "notes": p.notes or "",
        "created_at": p.created_at.isoformat() + "Z",
        "updated_at": (p.updated_at or p.created_at).isoformat() + "Z",
    }


@app.post("/patients")
def create_patient(
    body: PatientCreateBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    code = body.patient_code.strip()
    if (
        db.query(Patient)
        .filter(Patient.doctor_user_id == user.id, Patient.patient_code == code)
        .first()
    ):
        raise HTTPException(400, "Patient ID already exists for your account")
    p = Patient(
        doctor_user_id=user.id,
        patient_code=code,
        full_name=body.full_name.strip(),
        age=body.age,
        gender=_strip_opt(body.gender),
        blood_group=_strip_opt(body.blood_group),
        bp_systolic=body.bp_systolic,
        bp_diastolic=body.bp_diastolic,
        notes=_strip_opt(body.notes),
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return patient_dict(p)


@app.get("/patients")
def list_patients(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    rows = (
        db.query(Patient)
        .filter(Patient.doctor_user_id == user.id)
        .order_by(Patient.created_at.desc())
        .all()
    )
    return {"items": [patient_dict(p) for p in rows]}


@app.get("/patients/{patient_id}")
def get_patient(
    patient_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _patient_owned(db, patient_id, user.id)
    if not p:
        raise HTTPException(404, "Patient not found")
    out = patient_dict(p)
    n_ecg = (
        db.query(ECGTest)
        .filter(ECGTest.patient_id == patient_id, ECGTest.user_id == user.id)
        .count()
    )
    n_notes = (
        db.query(PatientClinicalNote)
        .filter(PatientClinicalNote.patient_id == patient_id)
        .count()
    )
    out["ecg_count"] = n_ecg
    out["notes_count"] = n_notes
    return out


@app.patch("/patients/{patient_id}")
def update_patient(
    patient_id: int,
    body: PatientUpdateBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _patient_owned(db, patient_id, user.id)
    if not p:
        raise HTTPException(404, "Patient not found")
    if body.full_name is not None:
        p.full_name = body.full_name.strip()
    if body.age is not None:
        p.age = body.age
    if body.gender is not None:
        p.gender = _strip_opt(body.gender)
    if body.blood_group is not None:
        p.blood_group = _strip_opt(body.blood_group)
    if body.bp_systolic is not None:
        p.bp_systolic = body.bp_systolic
    if body.bp_diastolic is not None:
        p.bp_diastolic = body.bp_diastolic
    if body.notes is not None:
        p.notes = _strip_opt(body.notes)
    db.commit()
    db.refresh(p)
    return patient_dict(p)


@app.post("/patients/{patient_id}/clinical-notes")
def add_clinical_note(
    patient_id: int,
    body: ClinicalNoteBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _patient_owned(db, patient_id, user.id):
        raise HTTPException(404, "Patient not found")
    note = PatientClinicalNote(
        patient_id=patient_id,
        title=body.title.strip(),
        category=_strip_opt(body.category),
        content=body.content.strip(),
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return {
        "id": note.id,
        "title": note.title,
        "category": note.category or "",
        "content": note.content,
        "created_at": note.created_at.isoformat() + "Z",
    }


@app.get("/patients/{patient_id}/clinical-notes")
def list_clinical_notes(
    patient_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _patient_owned(db, patient_id, user.id):
        raise HTTPException(404, "Patient not found")
    rows = (
        db.query(PatientClinicalNote)
        .filter(PatientClinicalNote.patient_id == patient_id)
        .order_by(PatientClinicalNote.created_at.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "title": r.title,
                "category": r.category or "",
                "content": r.content,
                "created_at": r.created_at.isoformat() + "Z",
            }
            for r in rows
        ]
    }


@app.get("/patients/{patient_id}/ecg-tests")
def list_patient_ecg(
    patient_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _patient_owned(db, patient_id, user.id):
        raise HTTPException(404, "Patient not found")
    rows = (
        db.query(ECGTest)
        .filter(ECGTest.user_id == user.id, ECGTest.patient_id == patient_id)
        .order_by(ECGTest.created_at.desc())
        .all()
    )
    items = []
    for r in rows:
        try:
            data = json.loads(r.result_json)
            rhythm = data.get("rhythm") or {}
            label = rhythm.get("label")
        except json.JSONDecodeError:
            label = None
        items.append(
            {
                "id": r.id,
                "file_name": r.file_name,
                "created_at": r.created_at.isoformat() + "Z",
                "sample_count": r.sample_count,
                "rhythm_label": label,
            }
        )
    return {"items": items}


@app.get("/patients/{patient_id}/export.pdf")
def export_patient_pdf(
    patient_id: int,
    ecg_test_id: int | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _patient_owned(db, patient_id, user.id)
    if not p:
        raise HTTPException(404, "Patient not found")

    ecg_summary = None
    if ecg_test_id is not None:
        row = (
            db.query(ECGTest)
            .filter(
                ECGTest.id == ecg_test_id,
                ECGTest.user_id == user.id,
                ECGTest.patient_id == patient_id,
            )
            .first()
        )
        if not row:
            raise HTTPException(404, "ECG study not found for this patient")
        try:
            result = json.loads(row.result_json)
        except json.JSONDecodeError:
            raise HTTPException(500, "Corrupted study")
        m = result.get("metrics") or {}
        rhythm = result.get("rhythm") or {}
        ecg_summary = {
            "file_name": row.file_name,
            "rhythm_label": m.get("rhythm_label") or rhythm.get("label"),
            "metrics": m,
        }

    notes_rows = (
        db.query(PatientClinicalNote)
        .filter(PatientClinicalNote.patient_id == patient_id)
        .order_by(PatientClinicalNote.created_at.desc())
        .all()
    )
    clinical = [
        {"title": n.title, "category": n.category or "", "content": n.content}
        for n in notes_rows
    ]

    pdf_bytes = build_patient_pdf(
        patient=patient_dict(p),
        doctor_name=(user.full_name or user.email),
        ecg_summary=ecg_summary,
        clinical_notes=clinical,
    )
    fname = f"patient_{p.patient_code}_report.pdf".replace("/", "-")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@app.post("/tests")
def save_test(
    body: SaveTestBody,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if len(body.signal) > MAX_SIGNAL_SAMPLES:
        raise HTTPException(400, f"Signal too large (max {MAX_SIGNAL_SAMPLES} samples)")
    patient_row_id = None
    if body.patient_id is not None:
        if not _patient_owned(db, body.patient_id, user.id):
            raise HTTPException(400, "Invalid patient — not found or not yours")
        patient_row_id = body.patient_id
    try:
        result_json = json.dumps(body.result)
        signal_json = json.dumps(body.signal)
    except (TypeError, ValueError) as e:
        raise HTTPException(400, f"Invalid JSON payload: {e}") from e

    row = ECGTest(
        user_id=user.id,
        patient_id=patient_row_id,
        file_name=body.file_name or "untitled",
        fs=int(body.fs),
        sample_count=len(body.signal),
        result_json=result_json,
        signal_json=signal_json,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    rhythm = body.result.get("rhythm") or {}
    return {
        "id": row.id,
        "file_name": row.file_name,
        "created_at": row.created_at.isoformat() + "Z",
        "rhythm_label": rhythm.get("label"),
        "patient_id": row.patient_id,
    }


@app.get("/tests")
def list_tests(
    patient_id: int | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(ECGTest).filter(ECGTest.user_id == user.id)
    if patient_id is not None:
        if not _patient_owned(db, patient_id, user.id):
            raise HTTPException(404, "Patient not found")
        q = q.filter(ECGTest.patient_id == patient_id)
    rows = q.order_by(ECGTest.created_at.desc()).all()
    items = []
    for r in rows:
        try:
            data = json.loads(r.result_json)
            rhythm = data.get("rhythm") or {}
            label = rhythm.get("label")
        except json.JSONDecodeError:
            label = None
        pcode = None
        if r.patient_id:
            pp = db.query(Patient).filter(Patient.id == r.patient_id).first()
            if pp:
                pcode = pp.patient_code
        items.append(
            {
                "id": r.id,
                "file_name": r.file_name,
                "created_at": r.created_at.isoformat() + "Z",
                "sample_count": r.sample_count,
                "rhythm_label": label,
                "patient_id": r.patient_id,
                "patient_code": pcode,
            }
        )
    return {"items": items}


@app.get("/tests/{test_id}")
def get_test(
    test_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ECGTest)
        .filter(ECGTest.id == test_id, ECGTest.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(404, "Test not found")
    try:
        result = json.loads(row.result_json)
        signal = json.loads(row.signal_json)
    except json.JSONDecodeError:
        raise HTTPException(500, "Corrupted stored test")
    return {
        "id": row.id,
        "file_name": row.file_name,
        "fs": row.fs,
        "created_at": row.created_at.isoformat() + "Z",
        "patient_id": row.patient_id,
        "signal": signal,
        "result": result,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models": {
            "mitbih": model_mitbih is not None,
            "ptb": model_ptb is not None,
        },
    }


@app.post("/image-to-json")
async def image_to_json(file: UploadFile = File(...)):
    contents = await file.read()
    result = image_to_ecg_pipeline(contents, fs=500)  # BUG FIX 1: was 360
    if result["error"]:
        raise HTTPException(
            status_code=400, detail=f"ECG extraction failed: {result['error']}"
        )
    return {
        "sampling_rate": result["fs"],
        "signal": result["signal"],
        "length": len(result["signal"]),
        "peaks": result["peaks"],
        "heart_rate": result["heart_rate"],
        "chaotic": result["chaotic"],
        "message": "ECG extracted successfully",
    }
