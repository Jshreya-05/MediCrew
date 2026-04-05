// DiagnosticSummary.jsx
export const CLASS_META = [
  {
    label: "Normal Sinus Rhythm",
    short: "NSR",
    color: "#c62828",
    bg: "rgba(198,40,40,0.08)",
    border: "rgba(198,40,40,0.3)",
    severity: "Normal",
    message: "Regular rhythm observed. Continue standard monitoring.",
    icon: "✓",
  },
  {
    label: "Atrial Fibrillation",
    short: "AFib",
    color: "#d32f2f",
    bg: "rgba(211,47,47,0.08)",
    border: "rgba(211,47,47,0.3)",
    severity: "Warning",
    message: "Irregular rhythm detected. Clinical review recommended.",
    icon: "⚠",
  },
  {
    label: "Ventricular Fibrillation",
    short: "VFib",
    color: "#b71c1c",
    bg: "rgba(183,28,28,0.08)",
    border: "rgba(183,28,28,0.3)",
    severity: "Critical",
    message: "Life-threatening arrhythmia. Immediate intervention required.",
    icon: "🚨",
  },
];

export default function DiagnosticSummary({ result, meta }) {
  if (!result || !meta) return null;

  return (
    <>
      {/* Rhythm diagnosis card */}
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

      {/* Disease classification card */}
      {result.disease && (
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

      {/* Alert banner */}
      {result.alert && (
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
    </>
  );
}