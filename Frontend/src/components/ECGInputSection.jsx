// ECGInputSection.jsx
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

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

export default function ECGInputSection({
  signal,
  fileName,
  loading,
  analyzeProgress,
  error,
  token,
  patientsList,
  selectedPatientId,
  onFileSelect,   // parent receives (fileOrSignal, name) – see note below
  onReset,
  onDemo,
  onAnalyze,
  onPatientChange,
}) {
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file, file.name);
  };
  const handleFileInput = (e) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f, f.name);
  };

  return (
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

      {/* 🔗 Link to the dedicated image upload page */}
      <div style={{ marginBottom: 16, textAlign: "center" }}>
        <Link
          to="/upload"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#f8f9fa",
            border: "1px solid #dee2e6",
            borderRadius: 40,
            padding: "6px 14px",
            fontSize: 12,
            color: "#d32f2f",
            textDecoration: "none",
            transition: "all 0.2s",
          }}
        >
          📷 Upload ECG Image instead
        </Link>
      </div>

      {/* CSV / JSON drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
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
          onChange={handleFileInput}
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
            onChange={(e) => onPatientChange(e.target.value)}
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
          onClick={onReset}
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
          onClick={onDemo}
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
        onClick={onAnalyze}
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
      {!token && (
        <div style={{ marginTop: 12, fontSize: 11, color: "#6c757d", lineHeight: 1.5 }}>
          <Link to="/signup" style={{ color: "#d32f2f" }}>
            Create an account
          </Link>{" "}
          to save each analysis and reopen it later.
        </div>
      )}

      {signal && (
        <>
          <div
            style={{
              fontSize: 12,
              color: "#6c757d",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginTop: 20,
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
        </>
      )}
    </div>
  );
}