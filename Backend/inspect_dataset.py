"""
inspect_dataset.py — check what your training data actually looks like

Run from Backend folder:  python inspect_dataset.py
"""

import ast
import numpy as np
import pandas as pd
from scipy.fft import rfft, rfftfreq
from collections import Counter

CSV_PATH = "data/ecg_dataset.csv"   # adjust if your path differs
FS = 500

df = pd.read_csv(CSV_PATH)
print(f"Dataset shape: {df.shape}")
print(f"Labels: {dict(df['label'].value_counts())}\n")

for label in ["Normal", "AFib", "VFib"]:
    subset = df[df["label"] == label]
    print(f"{'='*50}")
    print(f"CLASS: {label}  ({len(subset)} samples)")
    print(f"{'='*50}")

    signals = subset["signal"].head(10).apply(ast.literal_eval).tolist()

    stds, dom_freqs, ranges = [], [], []
    for s in signals:
        sig = np.array(s, dtype=np.float32)
        stds.append(sig.std())
        ranges.append(sig.max() - sig.min())

        # dominant frequency
        sig0 = sig - sig.mean()
        spec = np.abs(rfft(sig0))
        freqs = rfftfreq(len(sig0), d=1.0/FS)
        # ignore DC (index 0)
        dom_freq = freqs[np.argmax(spec[1:]) + 1]
        dom_freqs.append(dom_freq)

    print(f"  Signal length   : {len(signals[0])} samples = {len(signals[0])/FS:.1f}s")
    print(f"  Std  (mean)     : {np.mean(stds):.4f}")
    print(f"  Range (mean)    : {np.mean(ranges):.4f}")
    print(f"  Dominant freq   : {np.mean(dom_freqs):.2f} Hz  (min={min(dom_freqs):.2f}, max={max(dom_freqs):.2f})")
    print()

    # Print first signal raw to eyeball it
    print(f"  First 20 values : {signals[0][:20]}")
    print()

    # Check if AFib signals look suspiciously sine-like
    if label == "AFib":
        print("  >>> AFib check: are these signals actually irregular?")
        for i, s in enumerate(signals[:3]):
            sig = np.array(s)
            # real AFib has high spectral entropy (many frequencies)
            # sine waves have very low spectral entropy (one frequency)
            sig0 = sig - sig.mean()
            spec = np.abs(rfft(sig0)) + 1e-12
            spec_norm = spec / spec.sum()
            entropy = -np.sum(spec_norm * np.log(spec_norm + 1e-12))
            max_entropy = np.log(len(spec_norm))
            normalized_entropy = entropy / max_entropy
            print(f"    Sample {i}: spectral entropy = {normalized_entropy:.3f}  "
                  f"(0=pure sine, 1=pure noise, AFib should be >0.7)")
        print()
