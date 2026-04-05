// Header.jsx
import { Link } from "react-router-dom";

export default function Header({ user, logout }) {
  return (
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
  );
}