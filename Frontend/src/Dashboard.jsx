import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "./config.js";
import { useAuth } from "./context/AuthContext.jsx";

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
  if (q == null || Number.isNaN(q)) return "#6b7280";
  if (q >= 70) return "#00d4aa";
  if (q >= 40) return "#f5c542";
  return "#ff4d4d";
}

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

// ── Infinite ECG sample generator ───────────────────────────────
// Stateful generator — yields one sample per call, never loops or jumps
function createECGStream(beatLength = 210) {
  let phase = 0;
  const cycleLength = beatLength + Math.floor(beatLength * 0.35);
  return {
    nextSample() {
      const t = phase / beatLength;
      let v = (Math.random() - 0.5) * 0.012;
      if (phase < beatLength) {
        if (t > 0.05 && t < 0.20) { const p = (t-0.125)/0.07;  v += 0.12*Math.exp(-p*p*2); }
        if (t > 0.28 && t < 0.31) { const q = (t-0.295)/0.012; v -= 0.08*Math.exp(-q*q*3); }
        if (t > 0.30 && t < 0.40) { const r = (t-0.345)/0.022; v += 1.0 *Math.exp(-r*r*4); }
        if (t > 0.37 && t < 0.45) { const s = (t-0.40) /0.022; v -= 0.22*Math.exp(-s*s*3); }
        if (t > 0.46 && t < 0.72) { const w = (t-0.59) /0.09;  v += 0.18*Math.exp(-w*w*2); }
      }
      phase = (phase + 1) % cycleLength;
      return v;
    },
  };
}

// ── Shared canvas drawing engine ─────────────────────────────────
// Used by both ECGCanvas (real signal) and IdleECG (synth stream)
function useScrollingECG({ canvasRef, getNextSample, color, speed = 2.2, bgColor = "#0a0d12" }) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const HEAD_ERASE = 44;

    let animId, lastTime = 0, accumPx = 0;
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

    // Ring buffer — ring[i] = Y pixel at screen column i
    let ring = new Float32Array(W);
    let absX = 0;

    function sampleToY(v) {
      const pad = H * 0.12;
      return H / 2 - v * (H - pad * 2) * 0.44;
    }

    // Pre-fill
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
        ctx.strokeStyle = big ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.018)";
        ctx.lineWidth = big ? 0.7 : 0.4;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 20) {
        const big = y % 100 === 0;
        ctx.strokeStyle = big ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.018)";
        ctx.lineWidth = big ? 0.7 : 0.4;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    }

    function drawSegment(startSX, count) {
      if (count < 2) return;
      const layers = [
        { lw: 5,   alpha: 0.06, blur: 0 },
        { lw: 2.2, alpha: 0.2, blur: 0 },
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
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, W, H);
      drawGrid();

      const headSX = absX % W;

      // Black eraser band sweeping just ahead of the draw head
      ctx.fillStyle = bgColor;
      if (headSX + HEAD_ERASE <= W) {
        ctx.fillRect(headSX, 0, HEAD_ERASE, H);
      } else {
        ctx.fillRect(headSX, 0, W - headSX, H);
        ctx.fillRect(0, 0, HEAD_ERASE - (W - headSX), H);
      }

      // Draw in two clean segments around the ring wrap point
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

    animId = requestAnimationFrame((ts) => { lastTime = ts; loop(ts); });

    const ro = new ResizeObserver(() => {
      resize();
      ring = new Float32Array(W);
      for (let i = 0; i < W; i++) ring[i] = sampleToY(getNextSample());
      absX = W;
    });
    ro.observe(canvas);

    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, speed]);
}

// ── Continuous ECG scroll: plays your samples in time order, seamless loop ──
function ECGDataScrollCanvas({ signal, color = "#00d4aa" }) {
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const sigIdRef = useRef("");

  const sid = signal?.length
    ? `${signal.length}:${signal[0]}:${signal[Math.floor(signal.length / 2)]}:${signal[signal.length - 1]}`
    : "";
  if (sid !== sigIdRef.current) {
    sigIdRef.current = sid;
    streamRef.current = null;
  }

  if (!streamRef.current && signal?.length) {
    let vmin = signal[0];
    let vmax = signal[0];
    for (let i = 1; i < signal.length; i++) {
      const v = signal[i];
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
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
  }

  useScrollingECG({
    canvasRef,
    getNextSample: streamRef.current || (() => 0),
    color,
    speed: 2.05,
    bgColor: "#0a0d12",
  });

  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

// ── ECGCanvas — scrolling trace + optional anomaly overlay ──────
function ECGCanvas({ signal, flagged, color = "#00d4aa" }) {
  const n = signal?.length || 0;
  const seg = flagged && n > 0
    ? (() => {
        const a = Math.max(0, Math.min(n - 1, Math.floor(flagged[0])));
        const b = Math.max(a + 1, Math.min(n, Math.floor(flagged[1])));
        const leftPct = Math.max(0, Math.min(100, (a / n) * 100));
        const widthPct = Math.max(0, Math.min(100 - leftPct, ((b - a) / n) * 100));
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
              background: "rgba(255,77,77,0.10)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${seg.leftPct}%`,
              top: 0,
              bottom: 0,
              width: 0,
              borderLeft: "1px dashed rgba(255,77,77,0.5)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `${seg.leftPct + seg.widthPct}%`,
              top: 0,
              bottom: 0,
              width: 0,
              borderLeft: "1px dashed rgba(255,77,77,0.5)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: `calc(${Number(seg.leftPct.toFixed(4))}% + 6px)`,
              top: 4,
              fontSize: 11,
              fontFamily: "'DM Mono', monospace",
              whiteSpace: "nowrap",
            }}
          >
            ANOMALY
          </div>
        </div>
      )}
    </div>
  );
}

// ── IdleECG — synth stream, shown before signal is loaded ────────
function IdleECG() {
  const canvasRef = useRef(null);
  const streamRef = useRef(createECGStream(180));

  useScrollingECG({
    canvasRef,
    getNextSample: () => streamRef.current.nextSample(),
    color: "#00d4aa",
    speed: 1.8,
    bgColor: "#0a0d12",
  });

  return <canvas ref={canvasRef} style={{ width: "100%", height: "80px", display: "block" }} />;
}

// ── Probability Bar ──────────────────────────────────────────────
function ProbBar({ label, value, color, animate }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (animate) setTimeout(() => setWidth(value), 100);
  }, [value, animate]);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color, fontFamily: "'DM Mono', monospace" }}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
        <div style={{
          height: "100%", borderRadius: 3, background: color,
          width: `${width}%`, transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
          boxShadow: `0 0 8px ${color}80`,
        }} />
      </div>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: "#6b7280", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || "#f9fafb", fontFamily: "'DM Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AnalyzeProgressBar({ progress, active }) {
  if (!active && progress <= 0) return null;
  const pct = Math.min(100, Math.round(progress));
  return (
    <div style={{ marginTop: 12 }} aria-busy={active ? "true" : "false"}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{active ? "Analyzing signal & models…" : "Complete"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#00d4aa", fontFamily: "'DM Mono', monospace" }}>{pct}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 4,
          background: "linear-gradient(90deg, #00d4aa, #00f5c4)",
          transition: "width 0.12s ease-out",
          boxShadow: "0 0 12px rgba(0,212,170,0.35)",
        }} />
      </div>
    </div>
  );
}

// ── Dashboard (ECG analyzer) ─────────────────────────────────────
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
      const r = await fetch(`${API_BASE}/tests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    return () => { cancelled = true; };
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
          parsed = text.split(/[\n,\r]+/).map((v) => parseFloat(v.trim())).filter((v) => !isNaN(v));
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

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, []);

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
    const fs = 360, sig = [];
    for (let b = 0; b < 6; b++) {
      for (let t = 0; t < fs * 0.85; t++) {
        const x = t / fs;
        const qrs = Math.exp(-0.5 * Math.pow(((t % (fs * 0.85)) - 40) / 5, 2)) * 1.5;
        const p   = Math.exp(-0.5 * Math.pow(((t % (fs * 0.85)) - 15) / 8, 2)) * 0.25;
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
      const r = await fetch(`${API_BASE}/tests/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      const signalStored = data.processed_signal ?? signal;
      setAnalyzeProgress(100);
      setResult(data);
      if (data.processed_signal) setSignal(data.processed_signal);
      setTimeout(() => setAnimateBars(true), 200);
      setSuccessToast("Analysis completed successfully");

      if (token) {
        try {
          await fetch(`${API_BASE}/tests`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              file_name: fileName || "analysis",
              fs: 360,
              signal: signalStored,
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
    <div style={{ minHeight: "100vh", background: "#0a0d12", color: "#f9fafb", fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, background: "rgba(255,255,255,0.02)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(0,212,170,0.15)", border: "1px solid rgba(0,212,170,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>CardioAI</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>Clinical Decision Support</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {user ? (
            <>
              <Link to="/patients" style={{ fontSize: 13, color: "#00d4aa", textDecoration: "none", fontWeight: 600 }}>Patients</Link>
              <span style={{ fontSize: 12, color: "#9ca3af", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={user.email}>
                {user.full_name || user.email}
              </span>
              <button type="button" onClick={logout} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)", color: "#d1d5db", fontSize: 12, cursor: "pointer" }}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ fontSize: 13, color: "#9ca3af", textDecoration: "none" }}>Log in</Link>
              <Link to="/signup" style={{ fontSize: 13, color: "#00d4aa", textDecoration: "none", fontWeight: 600 }}>Sign up</Link>
            </>
          )}
          <div style={{ fontSize: 11, color: "#374151", fontFamily: "'DM Mono', monospace", background: "rgba(255,255,255,0.03)", padding: "4px 12px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.06)" }}>
            v1.0 · MIT-BIH Model
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 360px) 1fr", gap: 24, alignItems: "start" }}>

          {/* Left Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }}>
              <div style={{ fontSize: 12, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>ECG Input</div>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current.click()}
                style={{ border: `1.5px dashed ${dragging ? "#00d4aa" : "rgba(255,255,255,0.12)"}`, borderRadius: 10, padding: "28px 16px", textAlign: "center", cursor: "pointer", marginBottom: 12, background: dragging ? "rgba(0,212,170,0.04)" : "transparent", transition: "all 0.2s" }}
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
                <div style={{ fontSize: 13, color: "#9ca3af" }}>Drop .csv or .json file</div>
                <div style={{ fontSize: 11, color: "#4b5563", marginTop: 4 }}>or click to browse</div>
              </div>

              {fileName && (
                <div style={{ fontSize: 12, color: "#00d4aa", fontFamily: "'DM Mono', monospace", background: "rgba(0,212,170,0.06)", padding: "6px 10px", borderRadius: 6, marginBottom: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  ✓ {fileName}
                </div>
              )}

              {token && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Attach ECG to patient (optional)</label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(0,0,0,0.35)",
                      color: "#e5e7eb",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <option value="">— None —</option>
                    {patientsList.map((p) => (
                      <option key={p.id} value={String(p.id)}>{p.patient_code} — {p.full_name}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: "#4b5563", marginTop: 6 }}>
                    Create IDs and charts in <Link to="/patients" style={{ color: "#00d4aa" }}>Patients</Link>.
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <button type="button" onClick={resetWorkspace} style={{ padding: "9px 0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
                  Reset
                </button>
                <button type="button" onClick={loadDemo} style={{ padding: "9px 0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#9ca3af", fontSize: 13, cursor: "pointer" }}>
                  Load demo
                </button>
              </div>
              <button type="button" onClick={analyze} disabled={!signal || loading} style={{ width: "100%", padding: "10px 0", background: signal && !loading ? "#00d4aa" : "rgba(0,212,170,0.2)", border: "none", borderRadius: 8, color: signal && !loading ? "#0a0d12" : "#4b5563", fontSize: 14, fontWeight: 700, cursor: signal ? "pointer" : "not-allowed", transition: "all 0.2s", boxShadow: signal && !loading ? "0 0 20px rgba(0,212,170,0.3)" : "none" }}>
                {loading ? "Analyzing…" : "Run Analysis →"}
              </button>

              {(loading || analyzeProgress > 0) && (
                <AnalyzeProgressBar progress={analyzeProgress} active={loading} />
              )}

              {error && (
                <div role="alert" aria-live="assertive" style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", fontSize: 12, color: "#ff4d4d" }}>
                  {error}
                </div>
              )}
              {!user && (
                <div style={{ marginTop: 12, fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
                  <Link to="/signup" style={{ color: "#00d4aa" }}>Create an account</Link>
                  {" "}to save each analysis and reopen it later.
                </div>
              )}
            </div>

            {token && (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 12, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>Saved analyses</div>
                {historyLoading && <div style={{ fontSize: 12, color: "#4b5563" }}>Loading…</div>}
                {!historyLoading && historyItems.length === 0 && (
                  <div style={{ fontSize: 12, color: "#4b5563" }}>Run an analysis to store it here.</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                  {historyItems.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => loadSavedTest(h.id)}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: loadedTestId === h.id ? "1px solid rgba(0,212,170,0.45)" : "1px solid rgba(255,255,255,0.08)",
                        background: loadedTestId === h.id ? "rgba(0,212,170,0.08)" : "rgba(255,255,255,0.03)",
                        color: "#e5e7eb",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 600, color: "#f9fafb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.file_name}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
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
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 12, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Signal Info</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatCard label="Samples" value={signal.length.toLocaleString()} />
                  <StatCard label="Duration" value={`${(signal.length / 360).toFixed(1)}s`} />
                  <StatCard label="Min" value={Math.min(...signal).toFixed(3)} />
                  <StatCard label="Max" value={Math.max(...signal).toFixed(3)} />
                </div>
              </div>
            )}

            {result && meta && (
              <div style={{ background: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 16, padding: 20, animation: "fadeIn 0.4s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: `${meta.color}20`, border: `1.5px solid ${meta.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{meta.icon}</div>
                  <div>
                    <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>Diagnosis</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: meta.color }}>{meta.short}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.6 }}>{meta.message}</div>
              </div>
            )}
          </div>

          {/* Right Panel */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {result && (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, animation: "fadeIn 0.35s ease" }}>
                <div style={{ fontSize: 12, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>Metrics panel</div>
                <p style={{ fontSize: 11, color: "#4b5563", marginBottom: 14, lineHeight: 1.45 }}>Derived from the waveform (heuristic R-peak count). Not a substitute for clinical interpretation.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                  <StatCard
                    label="Heart rate"
                    value={result.metrics?.heart_rate_bpm != null ? `${result.metrics.heart_rate_bpm}` : "—"}
                    sub="BPM (estimated)"
                    color={result.metrics?.heart_rate_bpm != null ? "#00d4aa" : "#6b7280"}
                  />
                  <StatCard
                    label="R-R interval"
                    value={result.metrics?.rr_interval_ms_mean != null ? `${result.metrics.rr_interval_ms_mean}` : "—"}
                    sub={result.metrics?.rr_interval_ms_sd != null ? `SD ${result.metrics.rr_interval_ms_sd} ms` : "mean ms"}
                    color="#9ca3af"
                  />
                  <StatCard
                    label="Rhythm"
                    value={(result.metrics?.rhythm_label || result.rhythm?.label || "—").split(" ").slice(0, 2).join(" ")}
                    sub="Model class"
                    color={meta?.color || "#9ca3af"}
                  />
                  <StatCard
                    label="Signal quality"
                    value={result.metrics ? `${result.metrics.signal_quality_0_100}` : "—"}
                    sub="/ 100"
                    color={result.metrics ? qualityColor(result.metrics.signal_quality_0_100) : "#6b7280"}
                  />
                  <StatCard
                    label="Peaks detected"
                    value={result.metrics ? `${result.metrics.peaks_detected}` : "—"}
                    sub="R-like maxima"
                    color="#9ca3af"
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
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.03)",
                    color: "#9ca3af",
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
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(0,0,0,0.2)",
                      fontSize: 12,
                      color: "#9ca3af",
                      lineHeight: 1.65,
                    }}
                  >
                    <p style={{ marginBottom: 12, color: "#d1d5db", fontWeight: 600 }}>Heartbeat / BPM (from the trace)</p>
                    <ul style={{ marginLeft: 18, marginBottom: 14, listStyle: "disc" }}>
                      <li style={{ marginBottom: 8 }}>Each beat is linked to a tall <strong style={{ color: "#e5e7eb" }}>QRS</strong>-like spike. The app finds <strong style={{ color: "#e5e7eb" }}>R-like peaks</strong>: local maxima on a lightly smoothed signal, above an adaptive threshold, at least ~0.25&nbsp;s apart so the same beat is not counted twice.</li>
                      <li style={{ marginBottom: 8 }}><strong style={{ color: "#e5e7eb" }}>Peaks detected</strong> is how many peaks were accepted in your file.</li>
                      <li style={{ marginBottom: 8 }}><strong style={{ color: "#e5e7eb" }}>R–R interval</strong> is the time between consecutive peaks (ms). We show the <strong>mean</strong> and <strong>standard deviation (SD)</strong>. Higher SD often means more irregular timing (noise can increase SD too).</li>
                      <li><strong style={{ color: "#e5e7eb" }}>Heart rate (BPM)</strong> = 60 ÷ (mean R–R in seconds). Example: mean gap 1.0&nbsp;s → 60&nbsp;BPM. Needs at least two peaks.</li>
                    </ul>
                    <p style={{ marginBottom: 12, color: "#d1d5db", fontWeight: 600 }}>Rhythm label (NSR / AFib / VFib)</p>
                    <p style={{ marginBottom: 14 }}>That comes from the <strong style={{ color: "#e5e7eb" }}>trained model</strong> on a <strong style={{ color: "#e5e7eb" }}>fixed-length window</strong> (187 samples after preprocessing). It is <strong style={{ color: "#e5e7eb" }}>not</strong> the same algorithm as the peak counter, so BPM and label can disagree if the strip is noisy or the window is unrepresentative.</p>
                    <p style={{ marginBottom: 12, color: "#d1d5db", fontWeight: 600 }}>What “accuracy” means here</p>
                    <ul style={{ marginLeft: 18, listStyle: "disc" }}>
                      <li style={{ marginBottom: 8 }}>There is <strong style={{ color: "#e5e7eb" }}>no single accuracy %</strong> for your recording unless the same pipeline is validated on a labeled dataset. The <strong>probability bars</strong> are the model’s confidence scores, not proven sensitivity/specificity on you.</li>
                      <li style={{ marginBottom: 8 }}>BPM is only as good as peak detection; artifact and baseline drift can add or miss peaks. <strong style={{ color: "#e5e7eb" }}>Signal quality</strong> is a rough heuristic.</li>
                      <li>This app is for <strong style={{ color: "#e5e7eb" }}>education / decision support</strong>, not a certified diagnostic device.</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase" }}>ECG monitor</div>
                  <div style={{ fontSize: 11, color: "#4b5563", marginTop: 6, lineHeight: 1.45 }}>Continuous scroll through your recording in <strong style={{ color: "#9ca3af" }}>time order</strong> (loops smoothly end → start).</div>
                </div>
                {result?.flagged_segment && (
                  <div style={{ fontSize: 11, color: "#ff4d4d", background: "rgba(255,77,77,0.1)", padding: "3px 10px", borderRadius: 20, border: "1px solid rgba(255,77,77,0.2)", flexShrink: 0 }}>⚠ Anomaly flagged</div>
                )}
              </div>
              {signal
                ? <ECGCanvas key={`${loadedTestId ?? "live"}-${fileName}-${signal.length}`} signal={signal} flagged={result?.flagged_segment} color={meta?.color || "#00d4aa"} />
                : <IdleECG />
              }
            </div>

            {result && (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, animation: "fadeIn 0.4s ease" }}>
                <div style={{ fontSize: 12, color: "#6b7280", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 18 }}>Class Probabilities</div>
                {CLASS_META.map((cls) => (
                  <ProbBar key={cls.short} label={cls.label} value={result?.rhythm?.probabilities?.[cls.label] ?? 0} color={cls.color} animate={animateBars} />
                ))}
              </div>
            )}

            {result && meta && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, animation: "fadeIn 0.5s ease" }}>
                <StatCard label="Prediction" value={meta.short} color={meta.color} sub={meta.severity} />
                <StatCard label="Confidence" value={`${result.rhythm.probabilities[meta.label].toFixed(1)}%`} color={meta.color} sub="top class" />
                <StatCard label="Flagged" value={result.flagged_segment ? "Yes" : "None"} color={result.flagged_segment ? "#ff4d4d" : "#00d4aa"} sub="anomaly segment" />
              </div>
            )}

            {!signal && !result && (
              <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>🫀</div>
                <div style={{ fontSize: 14, color: "#4b5563" }}>Upload an ECG file or load the demo signal to begin analysis.</div>
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
            background: "rgba(0,212,170,0.12)",
            border: "1px solid rgba(0,212,170,0.35)",
            color: "#00d4aa",
            fontSize: 14,
            fontWeight: 600,
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
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
        button:hover { filter: brightness(1.1); }
        button:disabled:hover { filter: none; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      `}</style>
    </div>
  );
}