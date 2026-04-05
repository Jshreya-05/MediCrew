// MetricsAndVisualization.jsx - Enhanced with better aesthetics
import { useState, useRef, useEffect } from "react";
import { CLASS_META } from "./DiagnosticSummary.jsx";

function qualityColor(q) {
  if (q == null || Number.isNaN(q)) return "#6c757d";
  if (q >= 70) return "#b71c1c";
  if (q >= 40) return "#d32f2f";
  return "#e53935";
}

// Improved StatCard with subtle gradient and icon
function StatCard({ label, value, sub, color, icon }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #ffffff 0%, #fefefe 100%)",
        border: `1px solid ${color ? `${color}30` : "#e9ecef"}`,
        borderRadius: 16,
        padding: "18px 20px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.03)",
        transition: "all 0.25s ease",
        cursor: "default",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 6px rgba(0,0,0,0.02)";
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#6c757d",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: color || "#212529",
          fontFamily: "'DM Mono', monospace",
          lineHeight: 1.2,
          marginBottom: sub ? 4 : 0,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#6c757d", marginTop: 6, fontWeight: 400 }}>{sub}</div>}
      {color && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: `linear-gradient(90deg, ${color} 0%, ${color}80 100%)`,
          }}
        />
      )}
    </div>
  );
}

// Enhanced ProbBar with animated glow
function ProbBar({ label, value, color, animate }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (animate) setTimeout(() => setWidth(value), 100);
  }, [value, animate]);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#495057" }}>{label}</span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color,
            fontFamily: "'DM Mono', monospace",
            background: `${color}10`,
            padding: "2px 8px",
            borderRadius: 20,
          }}
        >
          {value.toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "#f1f3f5", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            borderRadius: 4,
            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
            width: `${width}%`,
            transition: "width 0.8s cubic-bezier(0.22, 0.97, 0.36, 1.02)",
            boxShadow: `0 0 6px ${color}aa`,
          }}
        />
      </div>
    </div>
  );
}

// ---------- ECGDataScrollCanvas (internal, unchanged for performance) ----------
function ECGDataScrollCanvas({ signal, color = "#d32f2f" }) {
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [streamKey, setStreamKey] = useState(0);

  useEffect(() => {
    if (!signal || signal.length === 0) {
      streamRef.current = null;
      setStreamKey((k) => k + 1);
      return;
    }
    let vmin = signal[0],
      vmax = signal[0];
    for (let i = 1; i < signal.length; i++) {
      if (signal[i] < vmin) vmin = signal[i];
      if (signal[i] > vmax) vmax = signal[i];
    }
    const range = vmax - vmin || 1;
    const L = signal.length;
    const blend = Math.min(64, Math.max(16, Math.floor(L / 25)));
    const period = L + blend;
    let idx = 0;
    streamRef.current = () => {
      const i = idx % period;
      let raw;
      if (i < L) {
        raw = signal[i];
      } else {
        const t = (i - L + 1) / blend;
        raw = signal[L - 1] * (1 - t) + signal[0] * t;
      }
      idx++;
      return ((raw - vmin) / range) * 2 - 1;
    };
    setStreamKey((k) => k + 1);
  }, [signal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !streamRef.current) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const HEAD_ERASE = 44;

    let animId,
      lastTime = 0,
      accumPx = 0;
    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;

    function resize() {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    }
    resize();

    let ring = new Float32Array(W);
    let absX = 0;
    const getNextSample = streamRef.current;

    function sampleToY(v) {
      const pad = H * 0.12;
      return H / 2 - v * (H - pad * 2) * 0.28;
    }

    for (let i = 0; i < W; i++) ring[i] = sampleToY(getNextSample());
    absX = W;

    function advance(px) {
      for (let i = 0; i < px; i++) {
        ring[absX % W] = sampleToY(getNextSample());
        absX++;
      }
    }

    function drawGrid() {
      for (let x = 0; x < W; x += 20) {
        const big = x % 100 === 0;
        ctx.strokeStyle = big ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.05)";
        ctx.lineWidth = big ? 0.7 : 0.4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += 20) {
        const big = y % 100 === 0;
        ctx.strokeStyle = big ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.05)";
        ctx.lineWidth = big ? 0.7 : 0.4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    function drawSegment(startSX, count) {
      if (count < 2) return;
      const layers = [
        { lw: 5, alpha: 0.1, blur: 0 },
        { lw: 2.2, alpha: 0.3, blur: 0 },
        { lw: 1.35, alpha: 1.0, blur: 8 },
      ];
      for (const { lw, alpha, blur } of layers) {
        ctx.beginPath();
        const x0 = startSX;
        ctx.moveTo(x0, ring[x0 % W]);
        for (let i = 1; i < count; i++) {
          const x = startSX + i;
          ctx.lineTo(x, ring[x % W]);
        }
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lw;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    function render() {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
      drawGrid();

      const headSX = absX % W;
      ctx.fillStyle = "#ffffff";
      if (headSX + HEAD_ERASE <= W) {
        ctx.fillRect(headSX, 0, HEAD_ERASE, H);
      } else {
        ctx.fillRect(headSX, 0, W - headSX, H);
        ctx.fillRect(0, 0, HEAD_ERASE - (W - headSX), H);
      }

      const traceStart = absX - W + HEAD_ERASE;
      const wrapAt = traceStart + (W - (traceStart % W));
      if (wrapAt < absX) {
        const pre = wrapAt - traceStart;
        if (pre > 1) drawSegment(traceStart % W, pre);
        const post = absX - wrapAt;
        if (post > 1) drawSegment(0, post);
      } else {
        drawSegment(traceStart % W, absX - traceStart);
      }
    }

    const speed = 2.05;
    function loop(ts) {
      const dt = Math.min(ts - lastTime, 50);
      lastTime = ts;
      accumPx += speed * (dt / 16.667);
      const steps = Math.floor(accumPx);
      accumPx -= steps;
      if (steps > 0) advance(steps);
      render();
      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame((ts) => {
      lastTime = ts;
      loop(ts);
    });

    const ro = new ResizeObserver(() => {
      resize();
      ring = new Float32Array(W);
      for (let i = 0; i < W; i++) ring[i] = sampleToY(getNextSample());
      absX = W;
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [color, streamKey]);

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", borderRadius: 16 }} />;
}

function ECGMonitor({ signal, flagged, color = "#d32f2f" }) {
  if (!signal || signal.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          height: "200px",
          background: "linear-gradient(145deg, #fafbfc, #ffffff)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #eef2f5",
          borderRadius: 16,
          color: "#8c9aa8",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        📊 No ECG data – upload a file or load demo
      </div>
    );
  }

  const n = signal.length;
  const seg =
    flagged && n > 0
      ? (() => {
          const a = Math.max(0, Math.min(n - 1, Math.floor(flagged[0])));
          const b = Math.max(a + 1, Math.min(n, Math.floor(flagged[1])));
          const leftPct = (a / n) * 100;
          const widthPct = ((b - a) / n) * 100;
          return { leftPct, widthPct };
        })()
      : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "200px", borderRadius: 16, overflow: "hidden", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.02)" }}>
      <ECGDataScrollCanvas signal={signal} color={color} />
      {seg && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div
            style={{
              position: "absolute",
              left: `${seg.leftPct}%`,
              top: 0,
              width: `${seg.widthPct}%`,
              height: "100%",
              background: "rgba(183,28,28,0.08)",
              backdropFilter: "blur(1px)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${seg.leftPct}%`,
              top: 0,
              bottom: 0,
              borderLeft: "2px solid rgba(183,28,28,0.7)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${seg.leftPct + seg.widthPct}%`,
              top: 0,
              bottom: 0,
              borderLeft: "2px solid rgba(183,28,28,0.7)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `calc(${seg.leftPct}% + 8px)`,
              top: 8,
              fontSize: 11,
              fontFamily: "'DM Mono', monospace",
              whiteSpace: "nowrap",
              background: "#fff",
              padding: "3px 10px",
              borderRadius: 20,
              color: "#b71c1c",
              fontWeight: 700,
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
              letterSpacing: "0.3px",
            }}
          >
            🚨 ANOMALY DETECTED
          </div>
        </div>
      )}
    </div>
  );
}

export default function MetricsAndVisualization({
  signal,
  result,
  meta,
  animateBars,
  showCalcHelp,
  onToggleCalcHelp,
}) {
  if (!result) return null;

  return (
    <>
      {/* Metrics Panel - Enhanced with card grouping */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef2f5",
          borderRadius: 24,
          padding: "24px 24px 28px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.03)",
          transition: "all 0.2s",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "#b71c1c",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          Clinical Metrics
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "#212529",
            marginBottom: 16,
            borderLeft: "3px solid #d32f2f",
            paddingLeft: 12,
          }}
        >
          Derived Parameters
        </div>
        <p style={{ fontSize: 12, color: "#6c757d", marginBottom: 24, lineHeight: 1.5 }}>
          Based on waveform analysis (R‑peak detection). For clinical use only in conjunction with physician review.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            gap: 14,
          }}
        >
          <StatCard
            label="Heart rate"
            value={result.metrics?.heart_rate_bpm != null ? `${result.metrics.heart_rate_bpm}` : "—"}
            sub="beats per minute"
            color={result.metrics?.heart_rate_bpm != null ? "#d32f2f" : "#6c757d"}
            icon="❤️"
          />
          <StatCard
            label="R-R interval"
            value={result.metrics?.rr_interval_ms_mean != null ? `${result.metrics.rr_interval_ms_mean}` : "—"}
            sub={result.metrics?.rr_interval_ms_sd != null ? `SD ${result.metrics.rr_interval_ms_sd} ms` : "mean ms"}
            color="#495057"
            icon="⏱️"
          />
          <StatCard
            label="Rhythm class"
            value={(result.metrics?.rhythm_label || result.rhythm?.label || "—")
              .split(" ")
              .slice(0, 2)
              .join(" ")}
            sub="model prediction"
            color={meta?.color || "#495057"}
            icon="📈"
          />
          <StatCard
            label="Signal quality"
            value={result.metrics ? `${result.metrics.signal_quality_0_100}` : "—"}
            sub="/100 (higher = better)"
            color={result.metrics ? qualityColor(result.metrics.signal_quality_0_100) : "#6c757d"}
            icon="🎛️"
          />
          <StatCard
            label="Peaks detected"
            value={result.metrics ? `${result.metrics.peaks_detected}` : "—"}
            sub="R‑like maxima"
            color="#495057"
            icon="⚡"
          />
        </div>
        <button
          type="button"
          onClick={onToggleCalcHelp}
          style={{
            marginTop: 28,
            width: "100%",
            padding: "12px 16px",
            borderRadius: 14,
            border: "1px solid #e9ecef",
            background: "#f8fafc",
            color: "#1e2a3a",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#f1f5f9";
            e.currentTarget.style.borderColor = "#d32f2f40";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#f8fafc";
            e.currentTarget.style.borderColor = "#e9ecef";
          }}
        >
          <span>{showCalcHelp ? "▼ Hide explanation" : "▶ How heart rate is calculated & what accuracy means"}</span>
          <span style={{ fontSize: 16, opacity: 0.6 }}>{showCalcHelp ? "−" : "?"}</span>
        </button>
        {showCalcHelp && (
          <div
            style={{
              marginTop: 20,
              padding: "18px 20px",
              borderRadius: 18,
              border: "1px solid #eef2f5",
              background: "#fefefe",
              fontSize: 13,
              color: "#4a5a6e",
              lineHeight: 1.65,
              boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02), 0 2px 6px rgba(0,0,0,0.02)",
            }}
          >
            <p style={{ marginBottom: 14, color: "#212529", fontWeight: 700, fontSize: 14 }}>
              💓 Heartbeat & BPM calculation
            </p>
            <ul style={{ marginLeft: 20, marginBottom: 20, listStyle: "disc", display: "flex", flexDirection: "column", gap: 8 }}>
              <li>Each heartbeat corresponds to a tall <strong style={{ color: "#d32f2f" }}>QRS spike</strong>. The algorithm detects R‑like peaks using adaptive thresholding (minimum distance ~0.25s).</li>
              <li><strong style={{ color: "#212529" }}>Peaks detected</strong> = number of accepted R peaks in your signal.</li>
              <li><strong style={{ color: "#212529" }}>R‑R interval</strong> = time between successive peaks (ms). Higher standard deviation = more irregular rhythm.</li>
              <li><strong style={{ color: "#212529" }}>Heart rate (BPM)</strong> = 60 / (mean R‑R interval in seconds). Requires at least two peaks.</li>
            </ul>
            <p style={{ marginBottom: 14, color: "#212529", fontWeight: 700, fontSize: 14 }}>
              🧠 Rhythm classification (NSR / AFib / VFib)
            </p>
            <p style={{ marginBottom: 20 }}>
              Derived from a deep learning model analyzing 187‑sample windows. May differ from BPM‑based estimates on noisy or borderline signals.
            </p>
            <p style={{ marginBottom: 12, color: "#212529", fontWeight: 700, fontSize: 14 }}>
              ⚠️ Important disclaimers
            </p>
            <ul style={{ marginLeft: 20, listStyle: "disc", display: "flex", flexDirection: "column", gap: 8 }}>
              <li>Probability bars represent <strong>model confidence scores</strong>, not clinical sensitivity/specificity.</li>
              <li>BPM accuracy depends on peak detection quality (affected by noise, ectopy, low amplitude).</li>
              <li>This tool is for <strong>educational and decision support</strong> – not a certified diagnostic device.</li>
            </ul>
          </div>
        )}
      </div>

      {/* ECG Monitor - Enhanced with subtle border glow */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef2f5",
          borderRadius: 24,
          padding: "20px 20px 24px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 12,
                color: "#b71c1c",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              Live ECG Trace
            </div>
            <div style={{ fontSize: 13, color: "#4a627a", lineHeight: 1.4 }}>
              Continuous scrolling waveform — loops smoothly from end to start. Vertical scale optimized for all wave components.
            </div>
          </div>
          {result?.flagged_segment && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#b71c1c",
                background: "rgba(183,28,28,0.08)",
                padding: "6px 14px",
                borderRadius: 40,
                border: "1px solid rgba(183,28,28,0.25)",
                backdropFilter: "blur(2px)",
              }}
            >
              ⚠️ Anomaly region highlighted
            </div>
          )}
        </div>
        <ECGMonitor signal={signal} flagged={result?.flagged_segment} color={meta?.color || "#d32f2f"} />
      </div>

      {/* Class Probabilities - enhanced with header gradient */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #eef2f5",
          borderRadius: 24,
          padding: "20px 24px 24px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: "#b71c1c",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Model Confidence
        </div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "#212529",
            marginBottom: 20,
            borderLeft: "3px solid #d32f2f",
            paddingLeft: 12,
          }}
        >
          Rhythm Probabilities
        </div>
        {CLASS_META.map((cls) => (
          <ProbBar
            key={cls.short}
            label={cls.label}
            value={result?.rhythm?.probabilities?.[cls.label] ?? 0}
            color={cls.color}
            animate={animateBars}
          />
        ))}
      </div>

      {/* Prediction summary cards - with hover lift */}
      {meta && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 14,
            animation: "fadeIn 0.5s ease",
          }}
        >
          <StatCard
            label="Primary Prediction"
            value={meta.short}
            color={meta.color}
            sub={meta.severity}
            icon="🩺"
          />
          <StatCard
            label="Model Confidence"
            value={`${result.rhythm.probabilities[meta.label].toFixed(1)}%`}
            color={meta.color}
            sub="top class probability"
            icon="📊"
          />
          <StatCard
            label="Arrhythmia Flag"
            value={result.flagged_segment ? "Yes" : "None"}
            color={result.flagged_segment ? "#b71c1c" : "#2e7d32"}
            sub={result.flagged_segment ? "segment highlighted" : "no anomaly detected"}
            icon={result.flagged_segment ? "🚨" : "✅"}
          />
        </div>
      )}
    </>
  );
}