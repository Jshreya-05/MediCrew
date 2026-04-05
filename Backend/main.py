"""
FastAPI backend — loads BOTH models at startup, runs both on every /predict call.

Start: uvicorn main:app --reload --port 8000
"""

import json
import os
from collections import Counter

import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

import db_models  # noqa: F401 — register ORM tables with Base.metadata
from auth_deps import get_current_user
from scipy.signal import find_peaks
from database import Base, engine, get_db, migrate_schema_v2, migrate_sqlite_users
from db_models import ECGTest, Patient, PatientClinicalNote, User
from security import create_access_token, hash_password, verify_password
from utils.ecg_metrics import compute_ecg_metrics
from utils.pdf_report import build_patient_pdf
from utils.preprocessing import get_flagged_segment, preprocess_signal

app = FastAPI(title="CardioAI — Dual Model API", version="1.0.0")

MAX_SIGNAL_SAMPLES = 250_000

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Class labels ─────────────────────────────────────────────────
RHYTHM_CLASSES  = ["Normal Sinus Rhythm", "Atrial Fibrillation", "Ventricular Fibrillation"]
DISEASE_CLASSES = ["Normal Heart", "Myocardial Infarction"]

# ── Load both models once at startup ────────────────────────────
model_mitbih  = None
model_ptb     = None

@app.on_event("startup")
def load_models():
    global model_mitbih, model_ptb

    Base.metadata.create_all(bind=engine)
    migrate_sqlite_users()
    migrate_schema_v2()

    # Try .keras first, then .h5, then fallback to .pkl
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


# ── Request / Response schemas ───────────────────────────────────
class ECGInput(BaseModel):
    signal: list[float]
    fs: int = 360


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


# ── Unified prediction (auto‑detects Keras vs sklearn) ──────────
def run_prediction(model, signal_1d: np.ndarray, class_names: list) -> dict:
    """
    Automatically detect model type (Keras CNN vs sklearn RandomForest)
    and run prediction.
    """
    try:
        # Check if it's a Keras model (has 'predict' method and 'layers' attribute)
        if hasattr(model, 'predict') and hasattr(model, 'layers'):
            # CNN expects shape (1, 187, 1)
            x = signal_1d.reshape(1, 187, 1)
            probs = model.predict(x, verbose=0)[0]
        # Check for sklearn / joblib models
        elif hasattr(model, 'predict_proba'):
            x = signal_1d.reshape(1, -1)
            probs = model.predict_proba(x)[0]
        else:
            raise TypeError(f"Unknown model type: {type(model)}")
    except Exception as e:
        raise RuntimeError(f"Prediction failed: {e}")

    pred = int(np.argmax(probs))
    return {
        "prediction": pred,
        "label": class_names[pred],
        "confidence": round(float(probs[pred]) * 100, 1),
        "probabilities": {class_names[i]: round(float(p) * 100, 1) for i, p in enumerate(probs)},
    }


def predict_on_peaks(model, raw: np.ndarray, peaks: np.ndarray, fs: int) -> dict:
    """
    Slice a 187-sample window around each detected R-peak, run the model on
    every beat, and return the majority-vote result plus per-beat details.
    """
    half = 93  # samples before the R-peak
    beat_results = []

    for p in peaks:
        start = p - half
        end   = start + 187
        if start < 0 or end > len(raw):
            continue
        segment = preprocess_signal(raw[start:end].tolist(), fs)
        beat_results.append(run_prediction(model, segment, RHYTHM_CLASSES))

    if not beat_results:
        # Fallback: classify the whole (preprocessed) signal as one beat
        segment = preprocess_signal(raw.tolist(), fs)
        return run_prediction(model, segment, RHYTHM_CLASSES)

    # Majority vote across all beats
    labels     = [r["label"] for r in beat_results]
    vote_label = Counter(labels).most_common(1)[0][0]
    vote_pred  = RHYTHM_CLASSES.index(vote_label)

    # Average confidence for the winning class
    winning_confs = [
        r["probabilities"][vote_label]
        for r in beat_results
    ]
    avg_conf = round(sum(winning_confs) / len(winning_confs), 1)

    # Average probability across all beats for every class
    avg_probs = {
        cls: round(
            sum(r["probabilities"][cls] for r in beat_results) / len(beat_results), 1
        )
        for cls in RHYTHM_CLASSES
    }

    return {
        "prediction":    vote_pred,
        "label":         vote_label,
        "confidence":    avg_conf,
        "probabilities": avg_probs,
        "beats_analysed": len(beat_results),
    }


@app.post("/predict")
def predict(data: ECGInput):
    if len(data.signal) < 50:
        raise HTTPException(400, "Signal too short — need at least 50 samples")

    raw = np.asarray(data.signal, dtype=np.float64)
    fs  = int(data.fs)

    # 1. Preprocess full signal (filter + normalise, pad/trim to 187)
    processed = preprocess_signal(data.signal, fs)

    # 2. R‑peak detection with robust threshold
    height_threshold   = np.percentile(raw, 90) * 0.5
    distance_threshold = int(0.4 * fs)  # 400 ms → max ~150 bpm

    peaks, _ = find_peaks(raw, height=height_threshold, distance=distance_threshold)

    if len(peaks) < 3:
        rr_intervals = []
        heart_rate   = 0
    else:
        rr_intervals = [(peaks[i + 1] - peaks[i]) / fs for i in range(len(peaks) - 1)]
        heart_rate   = round(60 / (sum(rr_intervals) / len(rr_intervals)), 1)

    # 3. Rhythm model — per-beat sliding window + majority vote
    rhythm_result = predict_on_peaks(model_mitbih, raw, peaks, fs)

    # 4. Disease model — single processed beat (PTB trained on single beats)
    disease_result = run_prediction(model_ptb, processed, DISEASE_CLASSES)

    # 5. Anomalous segment for explainability
    flagged = get_flagged_segment(processed)

    # 6. Combined alert level
    alert = _combined_alert(rhythm_result["prediction"], disease_result["prediction"])

    # 7. Time-domain metrics on full raw signal
    metrics = compute_ecg_metrics(raw, fs)
    metrics.update({
        "rhythm_label": rhythm_result["label"],
        "peaks":        peaks.tolist(),
        "rr_intervals": rr_intervals,
        "heart_rate":   heart_rate,
    })

    return {
        "rhythm":           rhythm_result,
        "disease":          disease_result,
        "flagged_segment":  flagged,
        "processed_signal": processed.tolist(),
        "alert":            alert,
        "metrics":          metrics,
    }


def _combined_alert(rhythm_pred: int, disease_pred: int) -> dict:
    """Combine both results into one clinical alert level."""
    if rhythm_pred == 2 or disease_pred == 1:
        # VFib OR heart attack → critical
        return {"level": "critical", "color": "#ff4d4d",
                "message": "Critical — immediate intervention required"}
    elif rhythm_pred == 1:
        # AFib → warning
        return {"level": "warning", "color": "#f5c542",
                "message": "Warning — clinical review recommended"}
    else:
        return {"level": "normal", "color": "#00d4aa",
                "message": "Normal — no immediate action required"}


# ── Auth ─────────────────────────────────────────────────────────
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


# ── Patients (clinician workspace) ───────────────────────────────
@app.post("/patients")
def create_patient(body: PatientCreateBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    code = body.patient_code.strip()
    if db.query(Patient).filter(Patient.doctor_user_id == user.id, Patient.patient_code == code).first():
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
def list_patients(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Patient).filter(Patient.doctor_user_id == user.id).order_by(Patient.created_at.desc()).all()
    return {"items": [patient_dict(p) for p in rows]}


@app.get("/patients/{patient_id}")
def get_patient(patient_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _patient_owned(db, patient_id, user.id)
    if not p:
        raise HTTPException(404, "Patient not found")
    out = patient_dict(p)
    n_ecg = db.query(ECGTest).filter(ECGTest.patient_id == patient_id, ECGTest.user_id == user.id).count()
    n_notes = db.query(PatientClinicalNote).filter(PatientClinicalNote.patient_id == patient_id).count()
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
def list_clinical_notes(patient_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
def list_patient_ecg(patient_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
        items.append({
            "id": r.id,
            "file_name": r.file_name,
            "created_at": r.created_at.isoformat() + "Z",
            "sample_count": r.sample_count,
            "rhythm_label": label,
        })
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


# ── Saved ECG tests (per user) ───────────────────────────────────
@app.post("/tests")
def save_test(body: SaveTestBody, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
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
        items.append({
            "id": r.id,
            "file_name": r.file_name,
            "created_at": r.created_at.isoformat() + "Z",
            "sample_count": r.sample_count,
            "rhythm_label": label,
            "patient_id": r.patient_id,
            "patient_code": pcode,
        })
    return {"items": items}


@app.get("/tests/{test_id}")
def get_test(test_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(ECGTest).filter(ECGTest.id == test_id, ECGTest.user_id == user.id).first()
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
            "ptb":    model_ptb    is not None,
        }
    }