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

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(0,0,0,0.25)",
  color: "#f9fafb",
  fontSize: 14,
  marginBottom: 14,
  boxSizing: "border-box",
};

const labelStyle = { display: "block", fontSize: 12, color: "#9ca3af", marginBottom: 6 };

export default function Signup() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [country, setCountry] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Enter a valid phone number (at least 7 digits).");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        phone: phone.trim(),
        organization: organization.trim() || null,
        country: country.trim() || null,
        date_of_birth: dateOfBirth.trim() || null,
      };
      const r = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(text || "Sign up failed");
      }
      if (!r.ok) {
        const msg = typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail.map((d) => d.msg).join(" ")
            : "Sign up failed";
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
      <div style={{ width: "100%", maxWidth: 440 }}>
        <Link to="/" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", display: "inline-block", marginBottom: 24 }}>← Back to CardioAI</Link>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Create account</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 22 }}>Your profile is stored with your account. ECG history stays private on this server.</p>
          <form onSubmit={onSubmit}>
            <label style={labelStyle}>Full name</label>
            <input
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              style={inputStyle}
            />
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
            <label style={labelStyle}>Phone</label>
            <input
              type="tel"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 0100"
              style={inputStyle}
            />
            <label style={labelStyle}>Organization / hospital (optional)</label>
            <input
              type="text"
              autoComplete="organization"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder="MediCrew Clinic"
              style={inputStyle}
            />
            <label style={labelStyle}>Country (optional)</label>
            <input
              type="text"
              autoComplete="country-name"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="United States"
              style={inputStyle}
            />
            <label style={labelStyle}>Date of birth (optional)</label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              style={inputStyle}
            />
            <label style={labelStyle}>Password (min 8 characters)</label>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, marginBottom: 18 }}
            />
            {error && (
              <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 8, background: "rgba(255,77,77,0.08)", border: "1px solid rgba(255,77,77,0.2)", fontSize: 13, color: "#ff4d4d" }}>
                {error}
              </div>
            )}
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
              {submitting ? "Creating…" : "Sign up"}
            </button>
          </form>
          <p style={{ marginTop: 20, fontSize: 13, color: "#6b7280", textAlign: "center" }}>
            Already have an account? <Link to="/login" style={{ color: "#00d4aa", fontWeight: 600 }}>Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
