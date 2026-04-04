import { useState, useRef, useEffect, useCallback } from "react";

const API = "http://localhost:8000";
const CLASS_META = [
  {
    label: "Normal Sinus Rhythm",
    short: "NSR",
    color: "#00d4aa",
    bg: "rgba(0,212,170,0.08)",
    border: "rgba(0,212,170,0.3)",
    severity: "Normal",
    message: "No immediate clinical action required.",
    icon: "✓",
  },
  {
    label: "Atrial Fibrillation",
    short: "AFib",
    color: "#f5c542",
    bg: "rgba(245,197,66,0.08)",
    border: "rgba(245,197,66,0.3)",
    severity: "Warning",
    message: "Irregular rhythm detected. Recommend clinical review.",
    icon: "⚠",
  },
  {
    label: "Ventricular Fibrillation",
    short: "VFib",
    color: "#ff4d4d",
    bg: "rgba(255,77,77,0.08)",
    border: "rgba(255,77,77,0.3)",
    severity: "Critical",
    message: "Life-threatening arrhythmia. Immediate intervention required.",
    icon: "🚨",
  },
];

// ── ECG Canvas Renderer ──────────────────────────────────────────
function ECGCanvas({ signal, flagged, color = "#00d4aa" }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!signal?.length) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    const min = Math.min(...signal);
    const max = Math.max(...signal);
    const range = max - min || 1;
    const step = W / (signal.length - 1);
    const pad = 24;

    const toY = (v) => pad + ((max - v) / range) * (H - pad * 2);

    // Flagged segment highlight
    if (flagged) {
      const x1 = flagged[0] * step;
      const x2 = flagged[1] * step;
      ctx.fillStyle = "rgba(255,77,77,0.12)";
      ctx.fillRect(x1, 0, x2 - x1, H);
      ctx.strokeStyle = "rgba(255,77,77,0.5)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, 0);
      ctx.lineTo(x2, H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,77,77,0.8)";
      ctx.font = "11px 'DM Mono', monospace";
      ctx.fillText("ANOMALY", x1 + 6, 16);
    }

    // Signal path
    ctx.beginPath();
    ctx.moveTo(0, toY(signal[0]));
    for (let i = 1; i < signal.length; i++) {
      ctx.lineTo(i * step, toY(signal[i]));
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [signal, flagged, color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "200px", display: "block" }}
    />
  );
}

// ── Animated ECG idle line ───────────────────────────────────────
function IdleECG() {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let offset = 0;

    const draw = () => {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      canvas.width = W;
      canvas.height = H;
      ctx.clearRect(0, 0, W, H);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,212,170,0.5)";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#00d4aa";
      ctx.shadowBlur = 8;

      for (let x = 0; x < W; x++) {
        const t = (x + offset) / 60;
        const beat = Math.exp(-Math.pow(((t % 1) - 0.5) * 10, 2)) * 40;
        const y = H / 2 - beat - Math.sin(t * 1.5) * 4;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      offset += 2;
      frameRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "80px", display: "block" }}
    />
  );
}

// ── Probability Bar ──────────────────────────────────────────────
function ProbBar({ label, value, color, animate }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (animate) setTimeout(() => setWidth(value), 100);
  }, [value, animate]);

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 13, color: "#9ca3af" }}>{label}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color,
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {value.toFixed(1)}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: "rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 3,
            background: color,
            width: `${width}%`,
            transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
            boxShadow: `0 0 8px ${color}80`,
          }}
        />
      </div>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#6b7280",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: color || "#f9fafb",
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [signal, setSignal] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [animateBars, setAnimateBars] = useState(false);
  const fileInputRef = useRef(null);

  const parseFile = (file) => {
    setFileName(file.name);
    setResult(null);
    setError("");

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target.result.trim();
        let parsed = [];

        if (file.name.endsWith(".json")) {
          const json = JSON.parse(text);

          if (Array.isArray(json)) {
            parsed = json;
          } else if (Array.isArray(json.signal)) {
            parsed = json.signal;
          } else {
            throw new Error("Invalid JSON format");
          }
        } else {
          parsed = text
            .split(/[\n,\r]+/)
            .map((v) => parseFloat(v.trim()))
            .filter((v) => !isNaN(v));
        }

        if (!parsed.length) throw new Error("Empty signal");
        if (parsed.length < 50) throw new Error("Signal too short");

        setSignal(parsed);
      } catch (err) {
        setError("Could not parse file: " + err.message);
        setSignal(null);
      }
    };

    reader.readAsText(file);
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, []);

  const loadDemo = () => {
    const fs = 360,
      sig = [];
    for (let b = 0; b < 6; b++) {
      for (let t = 0; t < fs * 0.85; t++) {
        const x = t / fs;
        const qrs =
          Math.exp(-0.5 * Math.pow(((t % (fs * 0.85)) - 40) / 5, 2)) * 1.5;
        const p =
          Math.exp(-0.5 * Math.pow(((t % (fs * 0.85)) - 15) / 8, 2)) * 0.25;
        const noise = (Math.random() - 0.5) * 0.04;
        sig.push(qrs + p + noise + Math.sin(x * 0.5) * 0.05);
      }
    }
    setSignal(sig);
    setFileName("demo_nsr.json");
    setResult(null);
    setError("");
  };

  const analyze = async () => {
    if (!signal) return;
    setLoading(true);
    setError("");
    setAnimateBars(false);
    try {
      const res = await fetch(`${API}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal, fs: 360 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data);
      if (data.processed_signal) setSignal(data.processed_signal);
      setTimeout(() => setAnimateBars(true), 200);
    } catch (e) {
      setError("API Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ✅ FIX: use result.rhythm.prediction (not result.prediction)
  const meta = result ? CLASS_META[result.rhythm.prediction] : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0d12",
        color: "#f9fafb",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 64,
          background: "rgba(255,255,255,0.02)",
          backdropFilter: "blur(10px)",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "rgba(0,212,170,0.15)",
              border: "1px solid rgba(0,212,170,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00d4aa"
              strokeWidth="2.5"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "-0.01em",
              }}
            >
              CardioAI
            </div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>
              Clinical Decision Support
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#374151",
            fontFamily: "'DM Mono', monospace",
            background: "rgba(255,255,255,0.03)",
            padding: "4px 12px",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          v1.0 · MIT-BIH Model
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "340px 1fr",
            gap: 20,
            alignItems: "start",
          }}
        >
          {/* ── Left Panel ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Upload Card */}
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                ECG Input
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current.click()}
                style={{
                  border: `1.5px dashed ${dragging ? "#00d4aa" : "rgba(255,255,255,0.12)"}`,
                  borderRadius: 10,
                  padding: "28px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  marginBottom: 12,
                  background: dragging ? "rgba(0,212,170,0.04)" : "transparent",
                  transition: "all 0.2s",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json"
                  style={{ display: "none" }}
                  onChange={(e) =>
                    e.target.files[0] && parseFile(e.target.files[0])
                  }
                />
                <div style={{ fontSize: 24, marginBottom: 8 }}>📂</div>
                <div style={{ fontSize: 13, color: "#9ca3af" }}>
                  Drop .csv or .json file
                </div>
                <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>
                  or click to browse
                </div>
              </div>

              {fileName && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#00d4aa",
                    fontFamily: "'DM Mono', monospace",
                    background: "rgba(0,212,170,0.06)",
                    padding: "6px 10px",
                    borderRadius: 6,
                    marginBottom: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  ✓ {fileName}
                </div>
              )}

              <button
                onClick={loadDemo}
                style={{
                  width: "100%",
                  padding: "9px 0",
                  marginBottom: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  color: "#9ca3af",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Load Demo Signal
              </button>

              <button
                onClick={analyze}
                disabled={!signal || loading}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background:
                    signal && !loading ? "#00d4aa" : "rgba(0,212,170,0.2)",
                  border: "none",
                  borderRadius: 8,
                  color: signal && !loading ? "#0a0d12" : "#4b5563",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: signal ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                  boxShadow:
                    signal && !loading
                      ? "0 0 20px rgba(0,212,170,0.3)"
                      : "none",
                }}
              >
                {loading ? "Analyzing…" : "Run Analysis →"}
              </button>

              {error && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 12px",
                    borderRadius: 6,
                    background: "rgba(255,77,77,0.08)",
                    border: "1px solid rgba(255,77,77,0.2)",
                    fontSize: 12,
                    color: "#ff4d4d",
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            {/* Signal Info */}
            {signal && (
              <div
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 14,
                  }}
                >
                  Signal Info
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <StatCard
                    label="Samples"
                    value={signal.length.toLocaleString()}
                  />
                  <StatCard
                    label="Duration"
                    value={`${(signal.length / 360).toFixed(1)}s`}
                  />
                  <StatCard
                    label="Min"
                    value={Math.min(...signal).toFixed(3)}
                  />
                  <StatCard
                    label="Max"
                    value={Math.max(...signal).toFixed(3)}
                  />
                </div>
              </div>
            )}

            {/* Result Diagnosis Card */}
            {result && meta && (
              <div
                style={{
                  background: meta.bg,
                  border: `1px solid ${meta.border}`,
                  borderRadius: 16,
                  padding: 20,
                  animation: "fadeIn 0.4s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: `${meta.color}20`,
                      border: `1.5px solid ${meta.color}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                    }}
                  >
                    {meta.icon}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Diagnosis
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: meta.color,
                      }}
                    >
                      {meta?.short}
                    </div>
                  </div>
                </div>
                <div
                  style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}
                >
                  {meta.message}
                </div>
              </div>
            )}
          </div>

          {/* ── Right Panel ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* ECG Chart */}
            <div
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  ECG Waveform
                </div>
                {result?.flagged_segment && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#ff4d4d",
                      background: "rgba(255,77,77,0.1)",
                      padding: "3px 10px",
                      borderRadius: 20,
                      border: "1px solid rgba(255,77,77,0.2)",
                    }}
                  >
                    ⚠ Anomaly flagged
                  </div>
                )}
              </div>
              {signal ? (
                <ECGCanvas
                  signal={signal}
                  flagged={result?.flagged_segment}
                  color={meta?.color || "#00d4aa"}
                />
              ) : (
                <IdleECG />
              )}
            </div>

            {/* Probabilities */}
            {result && (
              <div
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16,
                  padding: 20,
                  animation: "fadeIn 0.4s ease",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 18,
                  }}
                >
                  Class Probabilities
                </div>
                {CLASS_META.map((cls) => (
                  <ProbBar
                    key={cls.short}
                    label={cls.label}
                    // ✅ already correct — rhythm.probabilities is the right path
                    value={result?.rhythm?.probabilities?.[cls.label] ?? 0}
                    color={cls.color}
                    animate={animateBars}
                  />
                ))}
              </div>
            )}

            {/* Stats row */}
            {result && meta && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                  animation: "fadeIn 0.5s ease",
                }}
              >
                <StatCard
                  label="Prediction"
                  value={meta?.short}
                  color={meta.color}
                  sub={meta.severity}
                />
                <StatCard
                  label="Confidence"
                  // ✅ FIX: use result.rhythm.probabilities[meta.label]
                  value={`${result.rhythm.probabilities[meta.label].toFixed(1)}%`}
                  color={meta.color}
                  sub="top class"
                />
                <StatCard
                  label="Flagged"
                  value={result.flagged_segment ? "Yes" : "None"}
                  color={result.flagged_segment ? "#ff4d4d" : "#00d4aa"}
                  sub="anomaly segment"
                />
              </div>
            )}

            {/* Empty state */}
            {!signal && !result && (
              <div
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 16,
                  padding: 48,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>
                  🫀
                </div>
                <div style={{ fontSize: 14, color: "#4b5563" }}>
                  Upload an ECG file or load the demo signal to begin analysis.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        button:hover { filter: brightness(1.1); }
        ::-webkit-scrollbar { width: 6px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      `}</style>
    </div>
  );
}