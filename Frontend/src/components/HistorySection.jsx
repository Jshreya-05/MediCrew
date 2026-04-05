// HistorySection.jsx
export default function HistorySection({
  historyItems,
  historyLoading,
  loadedTestId,
  onLoadTest,
}) {
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
            onClick={() => onLoadTest(h.id)}
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
  );
}