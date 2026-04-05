# generate_ecg_test_data.py
import numpy as np
import json
import os

# ── Parameters ─────────────────────────────
fs = 360               # Sampling frequency (Hz)
duration_min = 6       # Duration in minutes
hr_bpm = 72            # Approximate heart rate (beats per minute)

# ── Derived parameters ────────────────────
duration_sec = duration_min * 60
samples = duration_sec * fs
rr_sec = 60 / hr_bpm
rr_samples = int(rr_sec * fs)

# ── Time array ────────────────────────────
t = np.arange(samples) / fs

# ── Gaussian-shaped ECG pulse ────────────
def gaussian_pulse(length=50, height=1.0):
    x = np.linspace(-1, 1, length)
    return height * np.exp(-5 * x**2)

# ── Generate single-lead ECG signal ──────
signal = np.zeros(samples)
for i in range(0, samples, rr_samples):
    if i + 50 < samples:
        signal[i:i+50] += gaussian_pulse(length=50, height=1.0)

# ── Add small random noise ───────────────
signal += np.random.normal(0, 0.02, size=samples)

# ── Prepare JSON data ────────────────────
data = {
    "signal": signal.tolist(),   # ECG voltage array
    "fs": fs,                    # Sampling frequency
    "duration_min": duration_min,
    "heart_rate_bpm": hr_bpm,
    "total_samples": samples
}

# ── Save to JSON ─────────────────────────
output_file = "synthetic_ecg_6min.json"
with open(output_file, "w") as f:
    json.dump(data, f, indent=4)

print(f"✓ {output_file} generated successfully")
print(f"Total samples: {samples}, Approx. beats: {samples // rr_samples}")