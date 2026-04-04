"""Heuristic ECG metrics from a 1-D lead (demo / decision-support, not diagnostic)."""

import numpy as np


def _empty_metrics() -> dict:
    return {
        "heart_rate_bpm": None,
        "rr_interval_ms_mean": None,
        "rr_interval_ms_sd": None,
        "peaks_detected": 0,
        "signal_quality_0_100": 0.0,
    }


def compute_ecg_metrics(sig: np.ndarray, fs: int) -> dict:
    x = np.asarray(sig, dtype=np.float64).ravel()
    n = int(x.size)
    if n < max(50, fs // 4):
        return _empty_metrics()

    x = x - np.median(x)
    if n >= 5:
        k = np.ones(3, dtype=np.float64) / 3.0
        xs = np.convolve(x, k, mode="same")
    else:
        xs = x.copy()
    ax = np.abs(xs)

    min_sep = max(int(0.25 * fs), 1)
    p50 = float(np.percentile(ax, 50))
    p90 = float(np.percentile(ax, 90))
    thresh = max(p50 + 0.35 * (p90 - p50), float(np.std(ax)) * 0.75)

    peaks: list[int] = []
    last = -min_sep
    for i in range(1, n - 1):
        if xs[i] >= xs[i - 1] and xs[i] > xs[i + 1] and ax[i] >= thresh:
            if i - last >= min_sep:
                peaks.append(i)
                last = i

    npk = len(peaks)
    hr = None
    rr_mean = None
    rr_sd = None
    if npk >= 2:
        rr_s = np.diff(peaks) / float(fs)
        rr_ms = rr_s * 1000.0
        rr_mean = float(np.mean(rr_ms))
        rr_sd = float(np.std(rr_ms))
        mean_rr_s = float(np.mean(rr_s))
        if mean_rr_s > 0:
            hr = float(max(30.0, min(220.0, 60.0 / mean_rr_s)))

    noise_est = float(np.median(np.abs(np.diff(xs))) + 1e-12)
    sig_est = float(np.percentile(ax, 95) + 1e-12)
    snr = sig_est / noise_est
    q_snr = min(100.0, snr * 6.0)
    if npk >= 3 and rr_mean and rr_mean > 0 and rr_sd is not None:
        cv = rr_sd / rr_mean
        q_reg = max(0.0, 100.0 - cv * 100.0)
    else:
        q_reg = 35.0 if npk < 2 else 55.0
    quality = round(0.55 * q_snr + 0.45 * q_reg, 1)
    quality = max(0.0, min(100.0, quality))

    return {
        "heart_rate_bpm": round(hr, 1) if hr is not None else None,
        "rr_interval_ms_mean": round(rr_mean, 1) if rr_mean is not None else None,
        "rr_interval_ms_sd": round(rr_sd, 2) if rr_sd is not None else None,
        "peaks_detected": int(npk),
        "signal_quality_0_100": quality,
    }
