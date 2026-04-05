// Dashboard.jsx - Red/White/Black Hospital Theme
import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "./config.js";
import { useAuth } from "./context/AuthContext.jsx";
import Footer from "./components/Footer.jsx";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_SAMPLES = 220_000;
const ALLOWED_EXT = /\.(csv|json)$/i;

function validateUploadFile(file) {
  if (!file) return { ok: false, message: "No file selected." };
  if (!ALLOWED_EXT.test(file.name)) return { ok: false, message: "Please choose a .csv or .json file." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "File is too large (maximum 15 MB)." };
  return { ok: true };
}

function qualityColor(q) {
  if (q == null || Number.isNaN(q)) return "#6c757d";
  if (q >= 70) return "#b71c1c"; // deep red for high quality
  if (q >= 40) return "#d32f2f"; // medium red
  return "#e53935"; // lighter red for low quality
}

const CLASS_META = [
  {
    label: "Normal Sinus Rhythm",
    short: "NSR",
    color: "#c62828", // dark red
    bg: "rgba(198,40,40,0.08)",
    border: "rgba(198,40,40,0.3)",
    severity: "Normal",
    message: "Regular rhythm observed. Continue standard monitoring.",
    icon: "✓",
  },
  {
    label: "Atrial Fibrillation",
    short: "AFib",
    color: "#d32f2f", // primary red
    bg: "rgba(211,47,47,0.08)",
    border: "rgba(211,47,47,0.3)",
    severity: "Warning",
    message: "Irregular rhythm detected. Clinical review recommended.",
    icon: "⚠",
  },
  {
    label: "Ventricular Fibrillation",
    short: "VFib",
    color: "#b71c1c", // deepest red
    bg: "rgba(183,28,28,0.08)",
    border: "rgba(183,28,28,0.3)",
    severity: "Critical",
    message: "Life-threatening arrhythmia. Immediate intervention required.",
    icon: "🚨",
  },
];

// ECGDataScrollCanvas – renders actual signal with red trace
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
        { lw: 5, alpha: 0.08, blur: 0 },
        { lw: 2.2, alpha: 0.25, blur: 0 },
        { lw: 1.35, alpha: 1.0, blur: 6 },
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

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", borderRadius: 12 }} />;
}

function ECGMonitor({ signal, flagged, color = "#d32f2f" }) {
  if (!signal || signal.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          height: "200px",
          background: "#f8f9fa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #e9ecef",
          borderRadius: 12,
          color: "#6c757d",
          fontSize: 13,
        }}
      >
        No ECG data – upload a file or load demo
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
    <div style={{ position: "relative", width: "100%", height: "200px" }}>
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
              background: "rgba(183,28,28,0.12)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${seg.leftPct}%`,
              top: 0,
              bottom: 0,
              borderLeft: "1px dashed rgba(183,28,28,0.6)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${seg.leftPct + seg.widthPct}%`,
              top: 0,
              bottom: 0,
              borderLeft: "1px dashed rgba(183,28,28,0.6)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `calc(${seg.leftPct}% + 6px)`,
              top: 4,
              fontSize: 11,
              fontFamily: "'DM Mono', monospace",
              whiteSpace: "nowrap",
              background: "#fff",
              padding: "2px 6px",
              borderRadius: 4,
              color: "#b71c1c",
              fontWeight: 600,
            }}
          >
            ANOMALY
          </div>
        </div>
      )}
    </div>
  );
}

function ProbBar({ label, value, color, animate }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (animate) setTimeout(() => setWidth(value), 100);
  }, [value, animate]);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "#495057" }}>{label}</span>
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
      <div style={{ height: 6, borderRadius: 3, background: "#e9ecef" }}>
        <div
          style={{
            height: "100%",
            borderRadius: 3,
            background: color,
            width: `${width}%`,
            transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
            boxShadow: `0 0 4px ${color}80`,
          }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e9ecef",
        borderRadius: 12,
        padding: "18px 20px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "#6c757d",
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
          color: color || "#212529",
          fontFamily: "'DM Mono', monospace",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "#6c757d", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AnalyzeProgressBar({ progress, active }) {
  if (!active && progress <= 0) return null;
  const pct = Math.min(100, Math.round(progress));
  return (
    <div style={{ marginTop: 12 }} aria-busy={active ? "true" : "false"}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#495057" }}>
          {active ? "Analyzing signal & models…" : "Complete"}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#d32f2f",
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 4,
          background: "#e9ecef",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 4,
            background: "linear-gradient(90deg, #b71c1c, #d32f2f)",
            transition: "width 0.12s ease-out",
            boxShadow: "0 0 8px rgba(211,47,47,0.4)",
          }}
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const [signal, setSignal] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [animateBars, setAnimateBars] = useState(false);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadedTestId, setLoadedTestId] = useState(null);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [successToast, setSuccessToast] = useState("");
  const [showCalcHelp, setShowCalcHelp] = useState(false);
  const [patientsList, setPatientsList] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!loading) return undefined;
    setAnalyzeProgress((p) => (p < 12 ? 12 : p));
    const id = setInterval(() => {
      setAnalyzeProgress((p) => (p >= 88 ? p : p + 1.5 + Math.random() * 3.5));
    }, 140);
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (loading || analyzeProgress !== 100) return undefined;
    const t = setTimeout(() => setAnalyzeProgress(0), 650);
    return () => clearTimeout(t);
  }, [loading, analyzeProgress]);

  useEffect(() => {
    if (!successToast) return undefined;
    const t = setTimeout(() => setSuccessToast(""), 4200);
    return () => clearTimeout(t);
  }, [successToast]);

  const refreshHistory = useCallback(async () => {
    if (!token) {
      setHistoryItems([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const r = await fetch(`${API_BASE}/tests`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const j = await r.json();
        setHistoryItems(j.items || []);
      }
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!token) {
      setPatientsList([]);
      setSelectedPatientId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/patients`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok || cancelled) return;
        const j = await r.json();
        if (!cancelled) setPatientsList(j.items || []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const parseFile = (file) => {
    const v = validateUploadFile(file);
    if (!v.ok) {
      setError(v.message);
      setSignal(null);
      setFileName("");
      return;
    }
    setFileName(file.name);
    setLoadedTestId(null);
    setResult(null);
    setError("");
    setSuccessToast("");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result.trim();
        let parsed = [];
        if (file.name.endsWith(".json")) {
          const json = JSON.parse(text);
          if (Array.isArray(json)) parsed = json;
          else if (Array.isArray(json.signal)) parsed = json.signal;
          else throw new Error("Invalid JSON format");
        } else {
          parsed = text
            .split(/[\n,\r]+/)
            .map((v) => parseFloat(v.trim()))
            .filter((v) => !isNaN(v));
        }
        if (!parsed.length) throw new Error("Empty signal");
        if (parsed.length < 50) throw new Error("Signal too short (need at least 50 samples)");
        if (parsed.length > MAX_SAMPLES) throw new Error(`Too many samples (max ${MAX_SAMPLES.toLocaleString()})`);
        setSignal(parsed);
        setSuccessToast("File loaded — ready to analyze");
      } catch (err) {
        setError("Validation failed: " + err.message);
        setSignal(null);
      }
    };
    reader.onerror = () => {
      setError("Could not read the file.");
      setSignal(null);
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) parseFile(file);
    },
    []
  );

  const resetWorkspace = () => {
    setSignal(null);
    setFileName("");
    setResult(null);
    setError("");
    setLoadedTestId(null);
    setSuccessToast("");
    setAnimateBars(false);
    setAnalyzeProgress(0);
    setSelectedPatientId("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const loadDemo = () => {
    setError("");
    setSuccessToast("");
    setLoadedTestId(null);
    const fs = 360,
      sig = [];
    for (let b = 0; b < 6; b++) {
      for (let t = 0; t < fs * 0.85; t++) {
        const x = t / fs;
        const qrs = Math.exp(-0.5 * Math.pow(((t % (fs * 0.85)) - 40) / 5, 2)) * 1.5;
        const p = Math.exp(-0.5 * Math.pow(((t % (fs * 0.85)) - 15) / 8, 2)) * 0.25;
        sig.push(qrs + p + (Math.random() - 0.5) * 0.04 + Math.sin(x * 0.5) * 0.05);
      }
    }
    setSignal(sig);
    setFileName("demo_nsr.json");
    setResult(null);
    setSuccessToast("Demo signal loaded");
  };

  const loadSavedTest = async (id) => {
    if (!token) return;
    setError("");
    setAnimateBars(false);
    try {
      const r = await fetch(`${API_BASE}/tests/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setFileName(j.file_name);
      setSignal(j.signal);
      setResult(j.result);
      setSelectedPatientId(j.patient_id != null ? String(j.patient_id) : "");
      setLoadedTestId(id);
      setTimeout(() => setAnimateBars(true), 200);
    } catch (e) {
      setError("Could not load saved test: " + e.message);
    }
  };

  const analyze = async () => {
    if (!signal) return;
    if (signal.length < 50) {
      setError("Signal too short — need at least 50 samples.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccessToast("");
    setAnalyzeProgress(14);
    setAnimateBars(false);
    setLoadedTestId(null);
    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signal, fs: 360 }),
      });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        if (!res.ok) throw new Error(raw || res.statusText || "Request failed");
        throw new Error("Invalid response from server");
      }
      if (!res.ok) {
        const msg = typeof data?.detail === "string" ? data.detail : raw;
        throw new Error(msg || res.statusText);
      }

      setAnalyzeProgress(100);
      setResult(data);
      setTimeout(() => setAnimateBars(true), 200);
      setSuccessToast("Analysis completed successfully");

      if (token) {
        try {
          await fetch(`${API_BASE}/tests`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              file_name: fileName || "analysis",
              fs: 360,
              signal: signal,
              result: data,
              patient_id: selectedPatientId ? parseInt(selectedPatientId, 10) : null,
            }),
          });
          refreshHistory();
        } catch {
          /* non-fatal */
        }
      }
    } catch (e) {
      setAnalyzeProgress(0);
      setError("Analysis failed: " + (e.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const meta = result ? CLASS_META[result.rhythm.prediction] : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#ffffff",
        color: "#212529",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid #e9ecef",
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 70,
          background: "#ffffff",
          position: "sticky",
          top: 0,
          zIndex: 100,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(211,47,47,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 21.35L10.55 20.03C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.54L12 21.35Z"
                fill="#d32f2f"
                stroke="none"
              />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: "#212529" }}>CardioAI</div>
            <div style={{ fontSize: 11, color: "#6c757d" }}>Clinical Decision Support</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Link to="/" style={{ fontSize: 13, color: "#495057", textDecoration: "none" }}>Home</Link>
          <Link to="/about" style={{ fontSize: 13, color: "#495057", textDecoration: "none" }}>About</Link>
          {user ? (
            <>
              <Link
                to="/patients"
                style={{ fontSize: 13, color: "#d32f2f", textDecoration: "none", fontWeight: 600 }}
              >
                Patients
              </Link>
              <span
                style={{
                  fontSize: 12,
                  color: "#495057",
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={user.email}
              >
                {user.full_name || user.email}
              </span>
              <button
                type="button"
                onClick={logout}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid #dee2e6",
                  background: "#f8f9fa",
                  color: "#495057",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ fontSize: 13, color: "#495057", textDecoration: "none" }}>
                Log in
              </Link>
              <Link
                to="/signup"
                style={{ fontSize: 13, color: "#d32f2f", textDecoration: "none", fontWeight: 600 }}
              >
                Sign up
              </Link>
            </>
          )}
          <div
            style={{
              fontSize: 11,
              color: "#6c757d",
              fontFamily: "'DM Mono', monospace",
              background: "#f8f9fa",
              padding: "4px 12px",
              borderRadius: 20,
              border: "1px solid #e9ecef",
            }}
          >
            v1.0 · MIT-BIH Model
          </div>
        </div>
      </header>

      <div style={{ flex: 1, maxWidth: 1180, margin: "0 auto", padding: "32px 24px", width: "100%" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(300px, 360px) 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          {/* Left Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e9ecef",
                borderRadius: 16,
                padding: 20,
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#6c757d",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  marginBottom: 14,
                }}
              >
                ECG Input
              </div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current.click()}
                style={{
                  border: `1.5px dashed ${dragging ? "#d32f2f" : "#dee2e6"}`,
                  borderRadius: 10,
                  padding: "28px 16px",
                  textAlign: "center",
                  cursor: "pointer",
                  marginBottom: 12,
                  background: dragging ? "rgba(211,47,47,0.04)" : "#f8f9fa",
                  transition: "all 0.2s",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) parseFile(f);
                  }}
                />
                <div style={{ fontSize: 24, marginBottom: 8 }}>📂</div>
                <div style={{ fontSize: 13, color: "#495057" }}>Drop .csv or .json file</div>
                <div style={{ fontSize: 11, color: "#adb5bd", marginTop: 4 }}>or click to browse</div>
              </div>

              {fileName && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#d32f2f",
                    fontFamily: "'DM Mono', monospace",
                    background: "rgba(211,47,47,0.08)",
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

              {token && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#495057", marginBottom: 6 }}>
                    Attach ECG to patient (optional)
                  </label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid #dee2e6",
                      background: "#ffffff",
                      color: "#212529",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <option value="">— None —</option>
                    {patientsList.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.patient_code} — {p.full_name}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: "#6c757d", marginTop: 6 }}>
                    Create IDs and charts in{" "}
                    <Link to="/patients" style={{ color: "#d32f2f" }}>
                      Patients
                    </Link>
                    .
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={resetWorkspace}
                  style={{
                    padding: "9px 0",
                    background: "#f8f9fa",
                    border: "1px solid #dee2e6",
                    borderRadius: 8,
                    color: "#495057",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={loadDemo}
                  style={{
                    padding: "9px 0",
                    background: "#f8f9fa",
                    border: "1px solid #dee2e6",
                    borderRadius: 8,
                    color: "#495057",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Load demo
                </button>
              </div>
              <button
                type="button"
                onClick={analyze}
                disabled={!signal || loading}
                style={{
                  width: "100%",
                  padding: "10px 0",
                  background: signal && !loading ? "#d32f2f" : "#e9ecef",
                  border: "none",
                  borderRadius: 8,
                  color: signal && !loading ? "#ffffff" : "#adb5bd",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: signal ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                  boxShadow: signal && !loading ? "0 4px 12px rgba(211,47,47,0.3)" : "none",
                }}
              >
                {loading ? "Analyzing…" : "Run Analysis →"}
              </button>

              {(loading || analyzeProgress > 0) && (
                <AnalyzeProgressBar progress={analyzeProgress} active={loading} />
              )}

              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  style={{
                    marginTop: 10,
                    padding: "8px 12px",
                    borderRadius: 6,
                    background: "rgba(183,28,28,0.08)",
                    border: "1px solid rgba(183,28,28,0.2)",
                    fontSize: 12,
                    color: "#b71c1c",
                  }}
                >
                  {error}
                </div>
              )}
              {!user && (
                <div style={{ marginTop: 12, fontSize: 11, color: "#6c757d", lineHeight: 1.5 }}>
                  <Link to="/signup" style={{ color: "#d32f2f" }}>
                    Create an account
                  </Link>{" "}
                  to save each analysis and reopen it later.
                </div>
              )}
            </div>

            {token && (
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e9ecef",
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#6c757d",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 12,
                  }}
                >
                  Saved analyses
                </div>
                {historyLoading && <div style={{ fontSize: 12, color: "#6c757d" }}>Loading…</div>}
                {!historyLoading && historyItems.length === 0 && (
                  <div style={{ fontSize: 12, color: "#6c757d" }}>
                    Run an analysis to store it here.
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {historyItems.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => loadSavedTest(h.id)}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border:
                          loadedTestId === h.id
                            ? "1px solid rgba(211,47,47,0.5)"
                            : "1px solid #e9ecef",
                        background: loadedTestId === h.id ? "rgba(211,47,47,0.04)" : "#ffffff",
                        color: "#212529",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 600,
                          color: "#212529",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h.file_name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#6c757d",
                          marginTop: 4,
                          fontFamily: "'DM Mono', monospace",
                        }}
                      >
                        {h.rhythm_label || "—"}
                        {h.patient_code ? ` · ${h.patient_code}` : ""}
                        {" · "}
                        {new Date(h.created_at).toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {signal && (
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e9ecef",
                  borderRadius: 16,
                  padding: 20,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#6c757d",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 14,
                  }}
                >
                  Signal Info
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatCard label="Samples" value={signal.length.toLocaleString()} />
                  <StatCard label="Duration" value={`${(signal.length / 360).toFixed(1)}s`} />
                  <StatCard
                    label="Min"
                    value={signal.reduce((a, v) => (v < a ? v : a), signal[0]).toFixed(3)}
                  />
                  <StatCard
                    label="Max"
                    value={signal.reduce((a, v) => (v > a ? v : a), signal[0]).toFixed(3)}
                  />
                </div>
              </div>
            )}

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
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
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
                        color: "#6c757d",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Diagnosis
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: meta.color }}>
                      {meta.short}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#495057", lineHeight: 1.6 }}>
                  {meta.message}
                </div>
              </div>
            )}

            {result?.disease && (
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e9ecef",
                  borderRadius: 16,
                  padding: 20,
                  animation: "fadeIn 0.45s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: "rgba(211,47,47,0.12)",
                      border: "1.5px solid rgba(211,47,47,0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                    }}
                  >
                    🫀
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6c757d",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Disease Classification
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#212529" }}>
                      {result.disease.label}
                    </div>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: "#6c757d" }}>Confidence</div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#d32f2f",
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {result.disease.confidence}%
                    </div>
                  </div>
                </div>
                {result.disease.probabilities && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(result.disease.probabilities).map(([label, val]) => (
                      <div key={label}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: 3,
                          }}
                        >
                          <span style={{ fontSize: 11, color: "#6c757d" }}>{label}</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#212529",
                              fontFamily: "'DM Mono', monospace",
                            }}
                          >
                            {Number(val).toFixed(1)}%
                          </span>
                        </div>
                        <div
                          style={{ height: 4, borderRadius: 2, background: "#e9ecef" }}
                        >
                          <div
                            style={{
                              height: "100%",
                              borderRadius: 2,
                              background: label === result.disease.label ? "#d32f2f" : "#ced4da",
                              width: `${val}%`,
                              transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result?.alert && (
              <div
                style={{
                  background: `${result.alert.color}12`,
                  border: `1px solid ${result.alert.color}55`,
                  borderRadius: 16,
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  animation: "fadeIn 0.5s ease",
                }}
              >
                <span style={{ fontSize: 20 }}>
                  {result.alert.level === "critical"
                    ? "🚨"
                    : result.alert.level === "warning"
                    ? "⚠️"
                    : "ℹ️"}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: result.alert.color,
                    lineHeight: 1.4,
                  }}
                >
                  {result.alert.message}
                </span>
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {result && (
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e9ecef",
                  borderRadius: 16,
                  padding: 20,
                  animation: "fadeIn 0.35s ease",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#6c757d",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    marginBottom: 14,
                  }}
                >
                  Metrics panel
                </div>
                <p style={{ fontSize: 11, color: "#6c757d", marginBottom: 14, lineHeight: 1.45 }}>
                  Derived from the waveform (heuristic R-peak count). Not a substitute for clinical
                  interpretation.
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 10,
                  }}
                >
                  <StatCard
                    label="Heart rate"
                    value={result.metrics?.heart_rate_bpm != null ? `${result.metrics.heart_rate_bpm}` : "—"}
                    sub="BPM (estimated)"
                    color={result.metrics?.heart_rate_bpm != null ? "#d32f2f" : "#6c757d"}
                  />
                  <StatCard
                    label="R-R interval"
                    value={result.metrics?.rr_interval_ms_mean != null ? `${result.metrics.rr_interval_ms_mean}` : "—"}
                    sub={result.metrics?.rr_interval_ms_sd != null ? `SD ${result.metrics.rr_interval_ms_sd} ms` : "mean ms"}
                    color="#495057"
                  />
                  <StatCard
                    label="Rhythm"
                    value={(result.metrics?.rhythm_label || result.rhythm?.label || "—")
                      .split(" ")
                      .slice(0, 2)
                      .join(" ")}
                    sub="Model class"
                    color={meta?.color || "#495057"}
                  />
                  <StatCard
                    label="Signal quality"
                    value={result.metrics ? `${result.metrics.signal_quality_0_100}` : "—"}
                    sub="/ 100"
                    color={result.metrics ? qualityColor(result.metrics.signal_quality_0_100) : "#6c757d"}
                  />
                  <StatCard
                    label="Peaks detected"
                    value={result.metrics ? `${result.metrics.peaks_detected}` : "—"}
                    sub="R-like maxima"
                    color="#495057"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCalcHelp((v) => !v)}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #dee2e6",
                    background: "#f8f9fa",
                    color: "#495057",
                    fontSize: 12,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {showCalcHelp ? "▼ Hide" : "▶ How heart rate is calculated & what accuracy means"}
                </button>
                {showCalcHelp && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "14px 16px",
                      borderRadius: 10,
                      border: "1px solid #e9ecef",
                      background: "#f8f9fa",
                      fontSize: 12,
                      color: "#495057",
                      lineHeight: 1.65,
                    }}
                  >
                    <p style={{ marginBottom: 12, color: "#212529", fontWeight: 600 }}>
                      Heartbeat / BPM (from the trace)
                    </p>
                    <ul style={{ marginLeft: 18, marginBottom: 14, listStyle: "disc" }}>
                      <li style={{ marginBottom: 8 }}>
                        Each beat is linked to a tall <strong style={{ color: "#212529" }}>QRS</strong>
                        -like spike. The app finds <strong style={{ color: "#212529" }}>R-like peaks</strong>: local
                        maxima above an adaptive threshold, at least ~0.25&nbsp;s apart.
                      </li>
                      <li style={{ marginBottom: 8 }}>
                        <strong style={{ color: "#212529" }}>Peaks detected</strong> is how many peaks were
                        accepted in your file.
                      </li>
                      <li style={{ marginBottom: 8 }}>
                        <strong style={{ color: "#212529" }}>R–R interval</strong> = time between consecutive
                        peaks (ms). Mean and SD shown. Higher SD = more irregular timing.
                      </li>
                      <li>
                        <strong style={{ color: "#212529" }}>Heart rate (BPM)</strong> = 60 ÷ (mean R–R in
                        seconds). Needs at least two peaks.
                      </li>
                    </ul>
                    <p style={{ marginBottom: 12, color: "#212529", fontWeight: 600 }}>
                      Rhythm label (NSR / AFib / VFib)
                    </p>
                    <p style={{ marginBottom: 14 }}>
                      From the <strong style={{ color: "#212529" }}>trained model</strong> on a fixed
                      187-sample window. Not the same as the peak counter — BPM and label can disagree
                      on noisy signals.
                    </p>
                    <p style={{ marginBottom: 12, color: "#212529", fontWeight: 600 }}>
                      What "accuracy" means here
                    </p>
                    <ul style={{ marginLeft: 18, listStyle: "disc" }}>
                      <li style={{ marginBottom: 8 }}>
                        Probability bars are model confidence scores, not clinical sensitivity/specificity.
                      </li>
                      <li style={{ marginBottom: 8 }}>BPM accuracy depends on peak detection quality.</li>
                      <li>
                        This app is for <strong style={{ color: "#212529" }}>education / decision support</strong>,
                        not a certified diagnostic device.
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e9ecef",
                borderRadius: 16,
                padding: 20,
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6c757d",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    ECG monitor
                  </div>
                  <div style={{ fontSize: 11, color: "#6c757d", marginTop: 6, lineHeight: 1.45 }}>
                    Continuous scroll through <strong>your actual recording</strong> (loops smoothly end →
                    start). <strong>Reduced vertical scale</strong> shows all waves compactly.
                  </div>
                </div>
                {result?.flagged_segment && (
                  <div
                    style={{
                      fontSize: 11,
                      color: "#b71c1c",
                      background: "rgba(183,28,28,0.1)",
                      padding: "3px 10px",
                      borderRadius: 20,
                      border: "1px solid rgba(183,28,28,0.2)",
                      flexShrink: 0,
                    }}
                  >
                    ⚠ Anomaly flagged
                  </div>
                )}
              </div>
              <ECGMonitor
                signal={signal}
                flagged={result?.flagged_segment}
                color={meta?.color || "#d32f2f"}
              />
            </div>

            {result && (
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e9ecef",
                  borderRadius: 16,
                  padding: 20,
                  animation: "fadeIn 0.4s ease",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    color: "#6c757d",
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
                    value={result?.rhythm?.probabilities?.[cls.label] ?? 0}
                    color={cls.color}
                    animate={animateBars}
                  />
                ))}
              </div>
            )}

            {result && meta && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                  animation: "fadeIn 0.5s ease",
                }}
              >
                <StatCard label="Prediction" value={meta.short} color={meta.color} sub={meta.severity} />
                <StatCard
                  label="Confidence"
                  value={`${result.rhythm.probabilities[meta.label].toFixed(1)}%`}
                  color={meta.color}
                  sub="top class"
                />
                <StatCard
                  label="Flagged"
                  value={result.flagged_segment ? "Yes" : "None"}
                  color={result.flagged_segment ? "#b71c1c" : "#d32f2f"}
                  sub="anomaly segment"
                />
              </div>
            )}

            {!signal && !result && (
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e9ecef",
                  borderRadius: 16,
                  padding: 48,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>🫀</div>
                <div style={{ fontSize: 14, color: "#6c757d" }}>
                  Upload an ECG file or load the demo signal to begin analysis.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

     
      {successToast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 28,
            right: 28,
            zIndex: 200,
            padding: "12px 18px",
            borderRadius: 10,
            background: "rgba(211,47,47,0.12)",
            border: "1px solid rgba(211,47,47,0.35)",
            color: "#d32f2f",
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
            animation: "toastSlide 0.35s ease",
          }}
        >
          ✓ {successToast}
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes toastSlide { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        button:hover { filter: brightness(0.97); }
        button:disabled:hover { filter: none; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #f1f3f5; }
        ::-webkit-scrollbar-thumb { background: #adb5bd; border-radius: 3px; }
      `}</style>
    </div>
  );
}