import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { API_BASE } from "../config.js";
import { useAuth } from "../context/AuthContext.jsx";

const card = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 20,
  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.03)",
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#ffffff",
  color: "#111827",
  fontSize: 14,
  marginBottom: 12,
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

const label = { display: "block", fontSize: 12, color: "#4b5563", marginBottom: 6, fontWeight: 500 };

async function authFetch(token, path, opts = {}) {
  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(opts.body && typeof opts.body === "string" ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!r.ok) {
    const msg = typeof data.detail === "string" ? data.detail : data.raw || r.statusText;
    throw new Error(msg || "Request failed");
  }
  return data;
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function Patients() {
  const { token, user, logout } = useAuth();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const [form, setForm] = useState({
    patient_code: "",
    full_name: "",
    age: "",
    gender: "",
    blood_group: "",
    bp_systolic: "",
    bp_diastolic: "",
    notes: "",
  });

  const [noteForm, setNoteForm] = useState({ title: "", category: "general", content: "" });
  const [ecgItems, setEcgItems] = useState({});
  const [notesItems, setNotesItems] = useState({});

  const loadPatients = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr("");
    try {
      const data = await authFetch(token, "/patients");
      setPatients(data.items || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const loadDetail = async (pid) => {
    if (!token) return;
    try {
      const [ecg, notes] = await Promise.all([
        authFetch(token, `/patients/${pid}/ecg-tests`),
        authFetch(token, `/patients/${pid}/clinical-notes`),
      ]);
      setEcgItems((m) => ({ ...m, [pid]: ecg.items || [] }));
      setNotesItems((m) => ({ ...m, [pid]: notes.items || [] }));
    } catch (e) {
      setErr(e.message);
    }
  };

  const toggleExpand = (pid) => {
    if (expandedId === pid) {
      setExpandedId(null);
      return;
    }
    setExpandedId(pid);
    loadDetail(pid);
  };

  const createPatient = async (e) => {
    e.preventDefault();
    if (!token) return;
    setErr("");
    try {
      await authFetch(token, "/patients", {
        method: "POST",
        body: JSON.stringify({
          patient_code: form.patient_code.trim(),
          full_name: form.full_name.trim(),
          age: form.age ? parseInt(form.age, 10) : null,
          gender: form.gender.trim() || null,
          blood_group: form.blood_group.trim() || null,
          bp_systolic: form.bp_systolic ? parseInt(form.bp_systolic, 10) : null,
          bp_diastolic: form.bp_diastolic ? parseInt(form.bp_diastolic, 10) : null,
          notes: form.notes.trim() || null,
        }),
      });
      setForm({
        patient_code: "",
        full_name: "",
        age: "",
        gender: "",
        blood_group: "",
        bp_systolic: "",
        bp_diastolic: "",
        notes: "",
      });
      loadPatients();
    } catch (e2) {
      setErr(e2.message);
    }
  };

  const saveDemographics = async (p) => {
    if (!token) return;
    const name = (p.full_name || "").trim();
    if (!name) {
      setErr("Full name is required.");
      return;
    }
    setErr("");
    try {
      await authFetch(token, `/patients/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          full_name: name,
          age: typeof p.age === "number" && !Number.isNaN(p.age) ? p.age : null,
          gender: (p.gender || "").trim() || null,
          blood_group: (p.blood_group || "").trim() || null,
          bp_systolic: typeof p.bp_systolic === "number" && !Number.isNaN(p.bp_systolic) ? p.bp_systolic : null,
          bp_diastolic: typeof p.bp_diastolic === "number" && !Number.isNaN(p.bp_diastolic) ? p.bp_diastolic : null,
          notes: (p.notes || "").trim() || null,
        }),
      });
      loadPatients();
    } catch (e) {
      setErr(e.message);
    }
  };

  const addNote = async (patientId) => {
    if (!token || !noteForm.title.trim() || !noteForm.content.trim()) return;
    setErr("");
    try {
      await authFetch(token, `/patients/${patientId}/clinical-notes`, {
        method: "POST",
        body: JSON.stringify({
          title: noteForm.title.trim(),
          category: noteForm.category.trim() || "general",
          content: noteForm.content.trim(),
        }),
      });
      setNoteForm({ title: "", category: "general", content: "" });
      loadDetail(patientId);
    } catch (e) {
      setErr(e.message);
    }
  };

  const exportPdf = async (patientId, ecgTestId = null) => {
    if (!token) return;
    setErr("");
    try {
      const q = ecgTestId != null ? `?ecg_test_id=${ecgTestId}` : "";
      const r = await fetch(`${API_BASE}/patients/${patientId}/export.pdf${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      downloadBlob(blob, `patient_report_${patientId}.pdf`);
    } catch (e) {
      setErr(e.message);
    }
  };

  const updateLocalPatient = (id, patch) => {
    setPatients((list) => list.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  if (!token) {
    return <Navigate to="/login" replace state={{ from: "/patients" }} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", color: "#111827", fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{
        borderBottom: "1px solid #e5e7eb",
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 60,
        background: "#ffffff",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link to="/" style={{ color: "#dc2626", textDecoration: "none", fontWeight: 700, fontSize: 15 }}>← Analyzer</Link>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Patient records</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#4b5563" }}>{user?.full_name || user?.email}</span>
          <button type="button" onClick={logout} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "transparent", color: "#374151", fontSize: 12, cursor: "pointer" }}>Log out</button>
        </div>
      </header>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 20px 48px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: "#111827" }}>Patients</h1>
        <p style={{ color: "#4b5563", fontSize: 14, marginBottom: 28, lineHeight: 1.5 }}>
          Create a hospital / clinic <strong style={{ color: "#111827" }}>patient ID</strong>, store demographics, vitals, free-text reports, and link ECG runs from the analyzer. Export a combined <strong style={{ color: "#111827" }}>PDF</strong> for the chart.
        </p>

        {err && (
          <div role="alert" style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#b91c1c", fontSize: 13 }}>
            {err}
          </div>
        )}

        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: "#4b5563", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16 }}>Register new patient</div>
          <form onSubmit={createPatient} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0 16px" }}>
            <div>
              <label style={label}>Patient ID (you assign)</label>
              <input style={input} required value={form.patient_code} onChange={(e) => setForm({ ...form, patient_code: e.target.value })} placeholder="e.g. MRN-10492" />
            </div>
            <div>
              <label style={label}>Full name</label>
              <input style={input} required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <label style={label}>Age</label>
              <input style={input} type="number" min={0} max={130} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
            </div>
            <div>
              <label style={label}>Gender</label>
              <input style={input} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="Optional" />
            </div>
            <div>
              <label style={label}>Blood group</label>
              <input style={input} value={form.blood_group} onChange={(e) => setForm({ ...form, blood_group: e.target.value })} placeholder="A+, O-, …" />
            </div>
            <div>
              <label style={label}>BP systolic</label>
              <input style={input} type="number" value={form.bp_systolic} onChange={(e) => setForm({ ...form, bp_systolic: e.target.value })} placeholder="mmHg" />
            </div>
            <div>
              <label style={label}>BP diastolic</label>
              <input style={input} type="number" value={form.bp_diastolic} onChange={(e) => setForm({ ...form, bp_diastolic: e.target.value })} placeholder="mmHg" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={label}>Clinical notes (summary)</label>
              <textarea style={{ ...input, minHeight: 72, resize: "vertical" }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button type="submit" style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: "#dc2626", color: "#ffffff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Save patient</button>
            </div>
          </form>
        </div>

        {loading ? (
          <p style={{ color: "#6b7280" }}>Loading…</p>
        ) : patients.length === 0 ? (
          <p style={{ color: "#6b7280" }}>No patients yet. Create one above.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {patients.map((p) => (
              <div key={p.id} style={{ ...card, borderColor: expandedId === p.id ? "rgba(220,38,38,0.4)" : "#e5e7eb" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(p.id)}
                    style={{ textAlign: "left", background: "none", border: "none", color: "#111827", cursor: "pointer", padding: 0 }}
                  >
                    <div style={{ fontFamily: "'DM Mono', monospace", color: "#dc2626", fontSize: 13 }}>{p.patient_code}</div>
                    <div style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>{p.full_name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                      {[p.age != null && `${p.age} yrs`, p.gender, p.blood_group].filter(Boolean).join(" · ") || "No demographics yet"}
                      {(p.bp_systolic != null && p.bp_diastolic != null) && ` · BP ${p.bp_systolic}/${p.bp_diastolic}`}
                    </div>
                  </button>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button type="button" onClick={() => exportPdf(p.id)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(220,38,38,0.35)", background: "rgba(220,38,38,0.08)", color: "#dc2626", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>PDF (demographics + notes)</button>
                  </div>
                </div>

                {expandedId === p.id && (
                  <div style={{ marginTop: 22, paddingTop: 22, borderTop: "1px solid #e5e7eb" }}>
                    <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 12, fontWeight: 500 }}>Edit & save</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                      <input style={input} value={p.full_name} onChange={(e) => updateLocalPatient(p.id, { full_name: e.target.value })} />
                      <input style={input} type="number" placeholder="Age" value={p.age ?? ""} onChange={(e) => updateLocalPatient(p.id, { age: e.target.value === "" ? null : parseInt(e.target.value, 10) })} />
                      <input style={input} placeholder="Gender" value={p.gender || ""} onChange={(e) => updateLocalPatient(p.id, { gender: e.target.value })} />
                      <input style={input} placeholder="Blood group" value={p.blood_group || ""} onChange={(e) => updateLocalPatient(p.id, { blood_group: e.target.value })} />
                      <input style={input} type="number" placeholder="Systolic" value={p.bp_systolic ?? ""} onChange={(e) => updateLocalPatient(p.id, { bp_systolic: e.target.value === "" ? null : parseInt(e.target.value, 10) })} />
                      <input style={input} type="number" placeholder="Diastolic" value={p.bp_diastolic ?? ""} onChange={(e) => updateLocalPatient(p.id, { bp_diastolic: e.target.value === "" ? null : parseInt(e.target.value, 10) })} />
                    </div>
                    <textarea style={{ ...input, minHeight: 70, marginTop: 8 }} placeholder="Clinical notes" value={p.notes || ""} onChange={(e) => updateLocalPatient(p.id, { notes: e.target.value })} />
                    <button type="button" onClick={() => saveDemographics(patients.find((x) => x.id === p.id))} style={{ marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", color: "#1f2937", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>Save changes</button>

                    <div style={{ marginTop: 24 }}>
                      <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10, fontWeight: 500 }}>ECG reports linked to this patient</div>
                      {(ecgItems[p.id] || []).length === 0 ? (
                        <p style={{ fontSize: 13, color: "#6b7280" }}>None yet — run analysis on the analyzer with this patient selected.</p>
                      ) : (
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {(ecgItems[p.id] || []).map((t) => (
                            <li key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
                              <span style={{ fontSize: 13, color: "#111827" }}>{t.file_name} · {t.rhythm_label || "—"}</span>
                              <button type="button" onClick={() => exportPdf(p.id, t.id)} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#ffffff", color: "#4b5563", fontSize: 11, cursor: "pointer" }}>PDF with this ECG</button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div style={{ marginTop: 24 }}>
                      <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10, fontWeight: 500 }}>Other reports / labs (free text)</div>
                      {(notesItems[p.id] || []).map((n) => (
                        <div key={n.id} style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{n.title} <span style={{ color: "#6b7280", fontWeight: 400 }}>({n.category})</span></div>
                          <div style={{ fontSize: 12, color: "#4b5563", marginTop: 6, whiteSpace: "pre-wrap" }}>{n.content}</div>
                          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 6 }}>{new Date(n.created_at).toLocaleString()}</div>
                        </div>
                      ))}
                      <div style={{ marginTop: 14 }}>
                        <input style={input} placeholder="Report title" value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} />
                        <input style={input} placeholder="Category (lab / vitals / other)" value={noteForm.category} onChange={(e) => setNoteForm({ ...noteForm, category: e.target.value })} />
                        <textarea style={{ ...input, minHeight: 80 }} placeholder="Report content" value={noteForm.content} onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })} />
                        <button type="button" onClick={() => addNote(p.id)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#dc2626", color: "#ffffff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Add report</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap');
        input:focus, textarea:focus, button:focus {
          outline: none;
          border-color: #dc2626;
          ring: 2px solid rgba(220,38,38,0.2);
        }
      `}</style>
    </div>
  );
}