import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ECGImageUpload() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [extractedData, setExtractedData] = useState(null);   // signal payload
  const [prediction, setPrediction] = useState(null);         // prediction result
  const [signalLength, setSignalLength] = useState(null);
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setError(null);
      setExtractedData(null);
      setPrediction(null);
      setSignalLength(null);
    }
  };

  // ── Download signal as JSON ───────────────────────────────────
  const handleDownloadJson = () => {
    if (!extractedData) return;
    const json = JSON.stringify(extractedData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ecg_signal_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Manual redirect to dashboard ─────────────────────────────
  const handleGoToDashboard = () => {
    navigate("/dashboard", { state: { prediction, signalLength } });
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select an image first");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setLoading(true);
    setError(null);
    setExtractedData(null);
    setPrediction(null);

    try {
      // Step 1: Convert image to signal
      const imageRes = await fetch("http://localhost:8000/image-to-json", {
        method: "POST",
        body: formData,
      });

      if (!imageRes.ok) {
        const errData = await imageRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Image processing failed");
      }

      const imageData = await imageRes.json();
      const { signal, sampling_rate } = imageData;

      if (!signal || signal.length === 0) {
        throw new Error("No signal extracted from image");
      }

      const payload = { signal, fs: sampling_rate || 360 };
      setExtractedData(payload);
      setSignalLength(signal.length);
      console.log("Extracted ECG payload:", payload);

      // Step 2: Run prediction
      const predictRes = await fetch("http://localhost:8000/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!predictRes.ok) {
        const errData = await predictRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Prediction failed");
      }

      const predictionData = await predictRes.json();
      setPrediction(predictionData);
      // ✅ No auto-redirect — user sees results and chooses what to do next

    } catch (err) {
      console.error("Upload error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Result state ─────────────────────────────────────────────
  const isDone = prediction !== null;
  const rhythmLabel = prediction?.rhythm?.label;
  const confidence = prediction?.rhythm?.confidence;
  const alertLevel = prediction?.alert?.level;
  const alertColor =
    alertLevel === "critical" ? "#ff4d4d"
    : alertLevel === "warning" ? "#f5c542"
    : "#00d4aa";

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>📈 ECG Image Analysis</h2>
        <p style={styles.subtitle}>
          Upload a photo or scan of an ECG paper strip – we'll extract the
          signal and run AI diagnosis.
        </p>

        {/* Upload area — hide after analysis is done */}
        {!isDone && (
          <div style={styles.uploadArea}>
            {preview ? (
              <div style={styles.previewContainer}>
                <img src={preview} alt="Preview" style={styles.previewImage} />
                <button
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setExtractedData(null);
                    setPrediction(null);
                  }}
                  style={styles.clearButton}
                >
                  ✕
                </button>
              </div>
            ) : (
              <label style={styles.fileLabel}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={styles.fileInput}
                />
                <span style={styles.uploadIcon}>📷</span>
                <span>Click or drag to upload</span>
              </label>
            )}
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        {/* Analyze button */}
        {!isDone && (
          <button
            onClick={handleUpload}
            disabled={!file || loading}
            style={{
              ...styles.button,
              opacity: !file || loading ? 0.6 : 1,
              cursor: !file || loading ? "not-allowed" : "pointer",
              marginBottom: 0,
            }}
          >
            {loading ? <span style={styles.spinner} /> : "🚀 Analyze ECG"}
          </button>
        )}

        {/* ── Results panel ── */}
        {isDone && (
          <div style={styles.resultsPanel}>
            {/* Mini image thumbnail */}
            {preview && (
              <img src={preview} alt="ECG" style={styles.thumbnail} />
            )}

            {/* Alert badge */}
            <div style={{ ...styles.alertBadge, background: alertColor + "22", border: `1px solid ${alertColor}` }}>
              <span style={{ ...styles.alertDot, background: alertColor }} />
              <span style={{ color: alertColor, fontWeight: 700, fontSize: 13 }}>
                {prediction?.alert?.message || alertLevel}
              </span>
            </div>

            {/* Key stats */}
            <div style={styles.statsRow}>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Rhythm</div>
                <div style={styles.statValue}>{rhythmLabel || "—"}</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Confidence</div>
                <div style={styles.statValue}>{confidence != null ? `${confidence}%` : "—"}</div>
              </div>
              <div style={styles.statBox}>
                <div style={styles.statLabel}>Heart Rate</div>
                <div style={styles.statValue}>
                  {prediction?.metrics?.heart_rate
                    ? `${prediction.metrics.heart_rate} bpm`
                    : "—"}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={styles.actionRow}>
              {/* Download JSON */}
              <button onClick={handleDownloadJson} style={styles.downloadButton}>
                ⬇️ Download JSON
              </button>

              {/* Go to dashboard — user clicks when ready */}
              <button onClick={handleGoToDashboard} style={styles.dashboardButton}>
                View Full Report →
              </button>
            </div>

            {/* Analyse another */}
            <button
              onClick={() => {
                setFile(null);
                setPreview(null);
                setExtractedData(null);
                setPrediction(null);
                setSignalLength(null);
                setError(null);
              }}
              style={styles.resetButton}
            >
              ↩ Analyse another image
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  },
  card: {
    maxWidth: "600px",
    width: "100%",
    background: "rgba(255,255,255,0.1)",
    backdropFilter: "blur(12px)",
    borderRadius: "32px",
    padding: "32px",
    boxShadow: "0 25px 45px rgba(0,0,0,0.2)",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "#fff",
  },
  title: {
    fontSize: "28px",
    fontWeight: "600",
    marginBottom: "8px",
    textAlign: "center",
  },
  subtitle: {
    fontSize: "14px",
    textAlign: "center",
    marginBottom: "32px",
    opacity: 0.8,
  },
  uploadArea: { marginBottom: "24px" },
  fileLabel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    background: "rgba(255,255,255,0.05)",
    border: "2px dashed rgba(255,255,255,0.3)",
    borderRadius: "20px",
    padding: "40px 20px",
    cursor: "pointer",
    transition: "all 0.2s ease",
    textAlign: "center",
  },
  fileInput: { display: "none" },
  uploadIcon: { fontSize: "48px" },
  previewContainer: { position: "relative", borderRadius: "16px", overflow: "hidden", marginBottom: 0 },
  previewImage: {
    width: "100%",
    maxHeight: "260px",
    objectFit: "contain",
    background: "#000",
    borderRadius: "16px",
    display: "block",
  },
  clearButton: {
    position: "absolute",
    top: "8px",
    right: "8px",
    background: "rgba(0,0,0,0.7)",
    border: "none",
    color: "white",
    borderRadius: "50%",
    width: "32px",
    height: "32px",
    cursor: "pointer",
    fontSize: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    width: "100%",
    padding: "14px",
    background: "linear-gradient(90deg, #00c6fb, #005bea)",
    border: "none",
    borderRadius: "40px",
    color: "white",
    fontSize: "16px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
  },
  spinner: {
    display: "inline-block",
    width: "20px",
    height: "20px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  error: {
    background: "rgba(255,80,80,0.2)",
    borderLeft: "4px solid #ff5252",
    padding: "12px 16px",
    borderRadius: "12px",
    marginBottom: "20px",
    fontSize: "14px",
  },
  // Results
  resultsPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  thumbnail: {
    width: "100%",
    maxHeight: 160,
    objectFit: "contain",
    background: "#000",
    borderRadius: 14,
  },
  alertBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 12,
  },
  alertDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 10,
  },
  statBox: {
    background: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    padding: "12px 10px",
    textAlign: "center",
  },
  statLabel: {
    fontSize: 11,
    opacity: 0.6,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontWeight: 700,
  },
  actionRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  downloadButton: {
    padding: "12px 0",
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "40px",
    color: "white",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
  },
  dashboardButton: {
    padding: "12px 0",
    background: "linear-gradient(90deg, #00c6fb, #005bea)",
    border: "none",
    borderRadius: "40px",
    color: "white",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
  },
  resetButton: {
    padding: "10px 0",
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.5)",
    fontSize: "13px",
    cursor: "pointer",
    textAlign: "center",
  },
};

if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}