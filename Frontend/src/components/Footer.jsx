// Footer.jsx
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer
      style={{
        background: "#212529",
        color: "#e9ecef",
        padding: "48px 24px 24px",
        marginTop: "auto",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 32,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 21.35L10.55 20.03C5.4 15.36 2 12.27 2 8.5 2 5.41 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.08C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.41 22 8.5c0 3.77-3.4 6.86-8.55 11.54L12 21.35Z"
                fill="#d32f2f"
              />
            </svg>
            <span style={{ fontWeight: 700, fontSize: "1.2rem" }}>CardioAI</span>
          </div>
          <p style={{ fontSize: "0.8rem", color: "#adb5bd", lineHeight: 1.5 }}>
            AI‑powered ECG interpretation for clinical decision support.
          </p>
        </div>

        <div>
          <h4 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 16, color: "white" }}>Product</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li style={{ marginBottom: 8 }}><Link to="/dashboard" style={{ color: "#adb5bd", textDecoration: "none", fontSize: "0.85rem" }}>Dashboard</Link></li>
            <li style={{ marginBottom: 8 }}><Link to="/about" style={{ color: "#adb5bd", textDecoration: "none", fontSize: "0.85rem" }}>About</Link></li>
            <li><Link to="/patients" style={{ color: "#adb5bd", textDecoration: "none", fontSize: "0.85rem" }}>Patients</Link></li>
          </ul>
        </div>

        <div>
          <h4 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 16, color: "white" }}>Legal</h4>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            <li style={{ marginBottom: 8 }}><a href="#" style={{ color: "#adb5bd", textDecoration: "none", fontSize: "0.85rem" }}>Privacy Policy</a></li>
            <li style={{ marginBottom: 8 }}><a href="#" style={{ color: "#adb5bd", textDecoration: "none", fontSize: "0.85rem" }}>Terms of Use</a></li>
            <li><a href="#" style={{ color: "#adb5bd", textDecoration: "none", fontSize: "0.85rem" }}>Clinical Disclaimer</a></li>
          </ul>
        </div>

        <div>
          <h4 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 16, color: "white" }}>Contact</h4>
          <p style={{ fontSize: "0.85rem", color: "#adb5bd", marginBottom: 8 }}>support@cardioai.org</p>
          <p style={{ fontSize: "0.85rem", color: "#adb5bd" }}>For research use only – not for emergency care</p>
        </div>
      </div>
      <div style={{ textAlign: "center", marginTop: 48, paddingTop: 24, borderTop: "1px solid #343a40", fontSize: "0.75rem", color: "#6c757d" }}>
        © {new Date().getFullYear()} CardioAI. All rights reserved.
      </div>
    </footer>
  );
}