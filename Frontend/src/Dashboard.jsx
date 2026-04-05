// Dashboard.jsx - refactored using 6 components
import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "./config.js";
import { useAuth } from "./context/AuthContext.jsx";

// Import the six components
import Header from "./components/Header.jsx";
import ECGInputSection from "./components/ECGInputSection.jsx";
import HistorySection from "./components/HistorySection.jsx";
import DiagnosticSummary from "./components/DiagnosticSummary.jsx";
import MetricsAndVisualization from "./components/MetricsAndVisualization.jsx";
import ToastNotification from "./components/ToastNotification.jsx";
import { CLASS_META } from "./components/DiagnosticSummary.jsx"; // reuse class metadata

// Constants (same as original)
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_SAMPLES = 220_000;
const ALLOWED_EXT = /\.(csv|json)$/i;

function validateUploadFile(file) {
  if (!file) return { ok: false, message: "No file selected." };
  if (!ALLOWED_EXT.test(file.name)) return { ok: false, message: "Please choose a .csv or .json file." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "File is too large (maximum 15 MB)." };
  return { ok: true };
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const [signal, setSignal] = useState(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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

  // --- Progress simulation (same as original) ---
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

  // --- History refresh ---
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

  // --- Patients list ---
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

  // --- File parsing ---
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

  // --- Reset workspace ---
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

  // --- Load demo signal ---
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

  // --- Load saved test ---
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

  // --- Analyze signal ---
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
        console.log(data)
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
      <Header user={user} logout={logout} />

      <div style={{ flex: 1, maxWidth: 1180, margin: "0 auto", padding: "32px 24px", width: "100%" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(300px, 360px) 1fr",
            gap: 24,
            alignItems: "start",
          }}
        >
          {/* Left Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ECGInputSection
              signal={signal}
              fileName={fileName}
              loading={loading}
              analyzeProgress={analyzeProgress}
              error={error}
              token={token}
              patientsList={patientsList}
              selectedPatientId={selectedPatientId}
              onFileSelect={parseFile}
              onReset={resetWorkspace}
              onDemo={loadDemo}
              onAnalyze={analyze}
              onPatientChange={setSelectedPatientId}
            />
            {token && (
              <HistorySection
                historyItems={historyItems}
                historyLoading={historyLoading}
                loadedTestId={loadedTestId}
                onLoadTest={loadSavedTest}
              />
            )}
          </div>

          {/* Right Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <DiagnosticSummary result={result} meta={meta} />
            <MetricsAndVisualization
              signal={signal}
              result={result}
              meta={meta}
              animateBars={animateBars}
              showCalcHelp={showCalcHelp}
              onToggleCalcHelp={() => setShowCalcHelp((v) => !v)}
            />
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

      <ToastNotification message={successToast} onClose={() => setSuccessToast("")} />

      {/* Global styles (same as original) */}
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