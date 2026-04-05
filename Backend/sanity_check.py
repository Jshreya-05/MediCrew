"""
sanity_check.py — test the trained model on real/unseen signals

Run this BEFORE trusting the 100% test accuracy.
The test set came from the same dataset as training, so 100% just means
the model memorized those patterns. This script tests generalization.
"""

import json
import numpy as np
import tensorflow as tf

CLASS_NAMES = ["Normal Sinus Rhythm", "Atrial Fibrillation", "Ventricular Fibrillation"]


def resample_to_187(signal):
    signal = np.asarray(signal, dtype=np.float64).reshape(-1)
    if len(signal) == 187:
        return signal.astype(np.float32)
    x_old = np.arange(len(signal), dtype=np.float64)
    x_new = np.linspace(0, len(signal) - 1, 187)
    return np.interp(x_new, x_old, signal).astype(np.float32)


def prepare(signal):
    x = resample_to_187(signal)
    return (x - x.mean()) / (x.std() + 1e-8)


def predict(model, signal, label="?"):
    x = prepare(np.array(signal)).reshape(1, 187, 1)
    probs = model.predict(x, verbose=0)[0]
    pred = int(np.argmax(probs))
    print(f"\n  [{label}]")
    print(f"  Prediction : {CLASS_NAMES[pred]}")
    print(f"  Confidence : {probs[pred]*100:.1f}%")
    print(f"  Probs      : Normal={probs[0]*100:.1f}%  AFib={probs[1]*100:.1f}%  VFib={probs[2]*100:.1f}%")
    correct = CLASS_NAMES[pred] == label
    print(f"  Correct    : {'YES' if correct else 'NO ← FAIL'}")
    return pred


print("Loading model...")
model = tf.keras.models.load_model("models/model_mitbih_cnn.keras")

# ── Test 1: your actual VFib JSON clip ──────────────────────────────────────
print("\n" + "="*55)
print("TEST 1: real VFib clip (vfib_ecg_0.5s.json)")
print("="*55)
try:
    with open("vfib_ecg_0.5s.json") as f:
        data = json.load(f)
    predict(model, data["signal"], label="Ventricular Fibrillation")
except FileNotFoundError:
    print("  vfib_ecg_0.5s.json not found — copy it to the Backend folder")

# ── Test 2: pure sine wave (should NOT be VFib) ──────────────────────────────
print("\n" + "="*55)
print("TEST 2: clean sine wave at 1 Hz (should be Normal)")
print("="*55)
t = np.linspace(0, 5, 2500)
sine = np.sin(2 * np.pi * 1.0 * t)
predict(model, sine, label="Normal Sinus Rhythm")

# ── Test 3: high-freq chaos (should be VFib) ─────────────────────────────────
print("\n" + "="*55)
print("TEST 3: synthetic VFib — high-freq chaos (should be VFib)")
print("="*55)
rng = np.random.default_rng(0)
t = np.linspace(0, 5, 2500)
chaos = (
    0.6 * np.sin(2 * np.pi * 6.0 * t + rng.uniform(0, 2*np.pi)) +
    0.3 * np.sin(2 * np.pi * 9.0 * t + rng.uniform(0, 2*np.pi)) +
    0.2 * rng.normal(0, 1, 2500)
)
predict(model, chaos, label="Ventricular Fibrillation")

# ── Test 4: regular rhythm with QRS-like spikes (should be Normal) ───────────
print("\n" + "="*55)
print("TEST 4: synthetic Normal — regular QRS spikes at 75 bpm")
print("="*55)
fs = 500
t = np.linspace(0, 5, 2500)
normal = np.zeros(2500)
# place QRS spikes every ~400ms (75 bpm)
for beat_center in range(200, 2500, 400):
    for offset in range(-5, 6):
        idx = beat_center + offset
        if 0 <= idx < 2500:
            normal[idx] += np.exp(-0.5 * (offset/2)**2)
normal += 0.05 * rng.normal(0, 1, 2500)
predict(model, normal, label="Normal Sinus Rhythm")

print("\n" + "="*55)
print("If TEST 1 fails → the model still can't handle short VFib clips")
print("If TEST 2/4 fail → the model is overfit to your dataset patterns")
print("="*55)
