"""
Train 1D-CNN rhythm model on real PhysioNet ECG (not synthetic CSV).

Data:
  - MIT-BIH Atrial Fibrillation Database (afdb): Normal + real AFib/AFlutter
  - MIT-BIH Arrhythmia Database (mitdb): Normal + VFib/VFlutter episodes

Preprocessing matches `main.py` inference:
  - `resample_to_187`: np.interp full window → 187 samples
  - z-score: (x - mean) / (std + 1e-8)

Augmentation replaces SMOTE (see `augment_signal`).

Callbacks monitor val_loss + ReduceLROnPlateau.

Run from Backend directory:
  python train_mitbih.py
"""

from __future__ import annotations

import os
import re
from collections import Counter
from pathlib import Path

import numpy as np
import wfdb
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
import tensorflow as tf
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from tensorflow.keras.layers import (
    BatchNormalization,
    Conv1D,
    Dense,
    Dropout,
    Flatten,
    MaxPooling1D,
)
from tensorflow.keras.models import Sequential
from tensorflow.keras.utils import to_categorical

# ─── paths ───────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent
PHYSIONET_DIR = ROOT / "data" / "physionet"
AFDB_DIR = PHYSIONET_DIR / "afdb"
MITDB_DIR = PHYSIONET_DIR / "mitdb"
MODELS_DIR = ROOT / "models"

CLASS_NAMES = [
    "Normal Sinus Rhythm",
    "Atrial Fibrillation",
    "Ventricular Fibrillation",
]

WINDOW_SEC = 5.0
STRIDE_SEC = 2.5
MIN_WINDOW_SAMPLES = 50
MAX_WINDOWS_PER_CLASS = 5000


def resample_to_187(signal: np.ndarray, target_len: int = 187) -> np.ndarray:
    signal = np.asarray(signal, dtype=np.float64).reshape(-1)
    if len(signal) == target_len:
        return signal.astype(np.float32)
    if len(signal) < 2:
        return np.repeat(signal.astype(np.float32), target_len)
    x_old = np.arange(len(signal), dtype=np.float64)
    x_new = np.linspace(0, len(signal) - 1, target_len)
    return np.interp(x_new, x_old, signal).astype(np.float32)


def normalize(signal: np.ndarray) -> np.ndarray:
    signal = np.asarray(signal, dtype=np.float32)
    return (signal - signal.mean()) / (signal.std() + 1e-8)


def prepare(signal: np.ndarray) -> np.ndarray:
    return normalize(resample_to_187(signal))


def augment_signal(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    x = np.asarray(x, dtype=np.float32).copy()
    x *= rng.uniform(0.85, 1.15)
    x += rng.normal(0, rng.uniform(0.01, 0.04), size=x.shape)
    freq = rng.uniform(0.1, 0.5)
    phase = rng.uniform(0, 2 * np.pi)
    amp = rng.uniform(0.01, 0.05)
    t = np.linspace(0, 1, len(x), dtype=np.float32)
    x = x + amp * np.sin(2 * np.pi * freq * t + phase).astype(np.float32)
    x = np.roll(x, int(rng.integers(-10, 11)))
    return normalize(x)


def oversample_with_augmentation(
    X: np.ndarray, y: np.ndarray, seed: int = 42
) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    counts = Counter(y.tolist())
    majority_count = counts.most_common(1)[0][1]

    X_out: list[np.ndarray] = [X.copy()]
    y_out: list[np.ndarray] = [y.copy()]
    for cls, n_have in counts.items():
        n_need = majority_count - n_have
        if n_need <= 0:
            continue
        print(f"  class {cls}: {n_have} real → +{n_need} augmented")
        idx = np.where(y == cls)[0]
        chosen = idx[rng.integers(0, len(idx), size=n_need)]
        aug = np.stack([augment_signal(X[i], rng) for i in chosen])
        X_out.append(aug)
        y_out.append(np.full(n_need, cls, dtype=y.dtype))

    X_all = np.concatenate(X_out)
    y_all = np.concatenate(y_out)
    perm = rng.permutation(len(X_all))
    return X_all[perm], y_all[perm]


def _aux_str(aux) -> str:
    if aux is None:
        return ""
    if isinstance(aux, bytes):
        return aux.decode("latin1", errors="ignore").strip("\x00").strip()
    return str(aux).strip("\x00").strip()


def rhythm_intervals_from_ann(ann: wfdb.Annotation, sig_len: int) -> list[tuple[int, int, str]]:
    """
    MIT-style rhythm annotations: aux_note strings starting with '(' mark rhythm changes.
    """
    rhythm = "(N"
    start = 0
    intervals: list[tuple[int, int, str]] = []

    n = len(ann.sample)
    for i in range(n):
        aux = _aux_str(ann.aux_note[i] if ann.aux_note is not None and i < len(ann.aux_note) else "")
        if not aux.startswith("("):
            continue
        samp = int(ann.sample[i])
        if samp > start:
            intervals.append((start, min(samp, sig_len), rhythm))
        start = min(samp, sig_len)
        rhythm = aux

    if start < sig_len:
        intervals.append((start, sig_len, rhythm))

    return [(a, b, r) for a, b, r in intervals if b > a and a < sig_len]


def _pick_ecg_channel(record: wfdb.Record) -> int:
    names = [str(n or "").upper() for n in (record.sig_name or [])]
    for prefer in ("MLII", "MLI", "V5", "V1", "ECG1", "ECG"):
        if prefer in names:
            return names.index(prefer)
    return 0


def _read_signal(record: wfdb.Record, ch: int) -> np.ndarray:
    x = np.asarray(record.p_signal[:, ch], dtype=np.float64)
    return np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)


def sliding_windows(
    sig: np.ndarray,
    fs: float,
    t0: int,
    t1: int,
) -> list[np.ndarray]:
    win = max(MIN_WINDOW_SAMPLES, int(WINDOW_SEC * fs))
    step = max(1, int(STRIDE_SEC * fs))
    out: list[np.ndarray] = []
    s = t0
    while s + win <= t1:
        out.append(sig[s : s + win].copy())
        s += step
    if t1 - t0 >= MIN_WINDOW_SAMPLES and not out:
        out.append(sig[t0:t1].copy())
    return out


def list_record_stems(db_dir: Path) -> list[str]:
    if not db_dir.is_dir():
        return []
    return sorted({p.stem for p in db_dir.glob("*.hea")})


def wfdb_record_path(db_dir: Path, stem: str) -> str:
    """Local path for wfdb (pn_dir=None): path/BASE without extension, relative to Backend root."""
    return (db_dir / stem).relative_to(ROOT).as_posix()


def ensure_physionet_downloaded() -> None:
    # dl_database writes record files directly into dl_dir (e.g. 207.hea), not dl_dir/mitdb/.
    PHYSIONET_DIR.mkdir(parents=True, exist_ok=True)
    AFDB_DIR.mkdir(parents=True, exist_ok=True)
    MITDB_DIR.mkdir(parents=True, exist_ok=True)
    if not list_record_stems(AFDB_DIR):
        print("Downloading MIT-BIH Atrial Fibrillation Database (afdb)…")
        wfdb.dl_database("afdb", dl_dir=str(AFDB_DIR))
    if not list_record_stems(MITDB_DIR):
        print("Downloading MIT-BIH Arrhythmia Database (mitdb)…")
        wfdb.dl_database("mitdb", dl_dir=str(MITDB_DIR))


def load_afdb_class01(max_per_class: int) -> tuple[list[np.ndarray], list[int]]:
    """Classes 0 = Normal (N,J), 1 = AFib / atrial flutter."""
    windows: list[np.ndarray] = []
    labels: list[int] = []
    counts = Counter({0: 0, 1: 0})

    for stem in list_record_stems(AFDB_DIR):
        if counts[0] >= max_per_class and counts[1] >= max_per_class:
            break
        rec_path = wfdb_record_path(AFDB_DIR, stem)
        try:
            record = wfdb.rdrecord(rec_path, pn_dir=None)
        except Exception as e:
            print(f"  afdb skip {stem}: {e}")
            continue

        ch = _pick_ecg_channel(record)
        fs = float(record.fs)
        sig = _read_signal(record, ch)
        sig_len = len(sig)

        try:
            ann = wfdb.rdann(rec_path, "atr", pn_dir=None)
        except Exception:
            continue

        for t0, t1, rhy in rhythm_intervals_from_ann(ann, sig_len):
            ru = rhy.upper()
            label: int | None
            if re.match(r"^\(N\b", ru) or ru.startswith("(J"):
                label = 0
            elif ru.startswith("(AFIB") or ru.startswith("(AFL"):
                label = 1
            else:
                label = None
            if label is None:
                continue
            if counts[label] >= max_per_class:
                continue
            for w in sliding_windows(sig, fs, t0, t1):
                if counts[label] >= max_per_class:
                    break
                windows.append(w)
                labels.append(label)
                counts[label] += 1

    return windows, labels


def load_mitdb_class02(max_per_class: int) -> tuple[list[np.ndarray], list[int]]:
    """Classes 0 = Normal, 2 = VFib / VFlutter (MIT rhythm aux strings)."""
    windows: list[np.ndarray] = []
    labels: list[int] = []
    counts = Counter({0: 0, 2: 0})

    for stem in list_record_stems(MITDB_DIR):
        if counts[0] >= max_per_class and counts[2] >= max_per_class:
            break
        rec_path = wfdb_record_path(MITDB_DIR, stem)
        try:
            record = wfdb.rdrecord(rec_path, pn_dir=None)
        except Exception as e:
            print(f"  mitdb skip {stem}: {e}")
            continue

        ch = _pick_ecg_channel(record)
        fs = float(record.fs)
        sig = _read_signal(record, ch)
        sig_len = len(sig)

        try:
            ann = wfdb.rdann(rec_path, "atr", pn_dir=None)
        except Exception:
            continue

        for t0, t1, rhy in rhythm_intervals_from_ann(ann, sig_len):
            ru = rhy.upper()
            label: int | None
            if re.match(r"^\(N\b", ru):
                label = 0
            elif ru.startswith("(VFIB") or ru.startswith("(VFL"):
                label = 2
            else:
                label = None
            if label is None:
                continue
            if counts[label] >= max_per_class:
                continue
            for w in sliding_windows(sig, fs, t0, t1):
                if counts[label] >= max_per_class:
                    break
                windows.append(w)
                labels.append(label)
                counts[label] += 1

    return windows, labels


def build_dataset() -> tuple[np.ndarray, np.ndarray]:
    ensure_physionet_downloaded()

    half_cap = max(1, MAX_WINDOWS_PER_CLASS // 2)
    print("Extracting AFDB windows (Normal + AFib)…")
    w_af, y_af = load_afdb_class01(half_cap)
    print("Extracting MITDB windows (Normal + VFib)…")
    w_mit, y_mit = load_mitdb_class02(half_cap)

    by_class: dict[int, list[np.ndarray]] = {0: [], 1: [], 2: []}
    for w, lab in zip(w_af, y_af):
        by_class[lab].append(w)
    for w, lab in zip(w_mit, y_mit):
        by_class[lab].append(w)

    print("Raw window counts:", {CLASS_NAMES[k]: len(v) for k, v in by_class.items()})
    if len(by_class[1]) == 0:
        raise RuntimeError("No AFib windows extracted — check AFDB download / annotations.")
    if len(by_class[2]) == 0:
        raise RuntimeError("No VFib windows extracted — check MITDB download / annotations.")

    # Cap each class to MAX_WINDOWS_PER_CLASS (shuffle then trim)
    rng = np.random.default_rng(42)
    trimmed: list[tuple[np.ndarray, int]] = []
    for cls in (0, 1, 2):
        items = by_class[cls]
        rng.shuffle(items)
        for w in items[:MAX_WINDOWS_PER_CLASS]:
            trimmed.append((w, cls))

    rng.shuffle(trimmed)
    X = np.stack([prepare(w) for w, _ in trimmed])
    y = np.array([lab for _, lab in trimmed], dtype=np.int64)
    print(f"Prepared X shape {X.shape}, distribution {Counter(y.tolist())}")
    return X, y


def build_cnn(input_len: int = 187, num_classes: int = 3) -> Sequential:
    model = Sequential(
        [
            Conv1D(
                32,
                5,
                activation="relu",
                padding="same",
                input_shape=(input_len, 1),
            ),
            BatchNormalization(),
            MaxPooling1D(2),
            Dropout(0.2),
            Conv1D(64, 5, activation="relu", padding="same"),
            BatchNormalization(),
            MaxPooling1D(2),
            Dropout(0.2),
            Conv1D(128, 3, activation="relu", padding="same"),
            BatchNormalization(),
            MaxPooling1D(2),
            Dropout(0.3),
            Flatten(),
            Dense(128, activation="relu"),
            Dropout(0.4),
            Dense(64, activation="relu"),
            Dense(num_classes, activation="softmax"),
        ]
    )
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def train() -> None:
    os.chdir(ROOT)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    print("🚀 Training 1D-CNN on PhysioNet (afdb + mitdb)…")
    X, y = build_dataset()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"\nBefore augmentation: {Counter(y_train.tolist())}")
    X_train, y_train = oversample_with_augmentation(X_train, y_train)
    print(f"After augmentation:  {Counter(y_train.tolist())}")
    print(f"Test dist:           {Counter(y_test.tolist())}")

    X_train_cnn = X_train.reshape(-1, 187, 1)
    X_test_cnn = X_test.reshape(-1, 187, 1)
    y_train_cat = to_categorical(y_train, num_classes=3)
    y_test_cat = to_categorical(y_test, num_classes=3)

    model = build_cnn()
    model.summary()

    callbacks = [
        EarlyStopping(
            monitor="val_loss",
            patience=10,
            restore_best_weights=True,
            verbose=1,
        ),
        ModelCheckpoint(
            filepath=str(MODELS_DIR / "model_mitbih_cnn.keras"),
            monitor="val_loss",
            save_best_only=True,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_loss",
            factor=0.5,
            patience=5,
            min_lr=1e-6,
            verbose=1,
        ),
    ]

    print("\n⚡ Training CNN…")
    model.fit(
        X_train_cnn,
        y_train_cat,
        validation_split=0.15,
        epochs=50,
        batch_size=64,
        callbacks=callbacks,
        verbose=1,
    )

    y_pred_prob = model.predict(X_test_cnn, verbose=0)
    y_pred = np.argmax(y_pred_prob, axis=1)
    acc = accuracy_score(y_test, y_pred)

    print("\n==============================")
    print("📊 MODEL PERFORMANCE")
    print("==============================")
    print(f"✅ Accuracy: {acc:.4f} ({acc * 100:.2f}%)\n")
    print("📄 Classification Report:")
    print(classification_report(y_test, y_pred, target_names=CLASS_NAMES))
    print("📉 Confusion Matrix (rows=true, cols=pred):")
    cm = confusion_matrix(y_test, y_pred)
    for i, row in enumerate(cm):
        print(f"  {CLASS_NAMES[i][:8]:8s}  {row}")

    model.save(str(MODELS_DIR / "model_mitbih_cnn.keras"))
    print(f"\n💾 Model saved → {MODELS_DIR / 'model_mitbih_cnn.keras'}")


if __name__ == "__main__":
    train()
