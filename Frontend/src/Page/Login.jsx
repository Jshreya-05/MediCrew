import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../config.js";
import { useAuth } from "../context/AuthContext.jsx";

const shell = {
  minHeight: "100vh",
  background: "#0a0d12",
  color: "#f9fafb",
  fontFamily: "'DM Sans', sans-serif",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const r = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const text = await r.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || "Login failed");
      }
      if (!r.ok) {
        const msg = typeof data.detail === "string" ? data.detail : Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join(" ") : text || "Login failed";
        throw new Error(msg);
      }
      login(data.access_token, data.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={shell}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap');
      `}</style>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <Link to="/" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", display: "inline-block", marginBottom: 24 }}>← Back to CardioAI</Link>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Log in</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>Use your account to save and reload ECG analyses.</p>
          <form onSubmit={onSubmit}>
            <label style={{ display: "block", fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "#f9fafb", fontSize: 14, marginBottom: 16, boxSizing: "border-box" }}
            />
            <label style={{ display: "block", fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.25)", color: "#f9fafb", fontSize: 14, marginBottom: 20, boxSizing: "border-box" }}
            />
            {error && <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 8, background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", fontSize: 13, color: "#ff4d4d" }}>{error}</div>}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 8,
                border: "none",
                background: submitting ? "rgba(0,212,170,0.3)" : "#00d4aa",
                color: "#0a0d12",
                fontSize: 15,
                fontWeight: 700,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Signing in…" : "Log in"}
            </button>
          </form>
          <p style={{ marginTop: 20, fontSize: 13, color: "#6b7280", textAlign: "center" }}>
            No account? <Link to="/signup" style={{ color: "#00d4aa", fontWeight: 600 }}>Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
