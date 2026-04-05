// Landing.jsx
import { Link } from "react-router-dom";
import Footer from "./Footer";
import Header from "./Header";

export default function Landing() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative" }}>
      <Header/>
      {/* Background Image (hospital) */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: -2,
          backgroundImage: "url('https://plus.unsplash.com/premium_photo-1682130157004-057c137d96d5?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8aG9zcGl0YWx8ZW58MHx8MHx8fDA%3D')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />
      {/* Overlay for readability */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: -1,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(2px)",
        }}
      />

      {/* Hero Section with Glassmorphism */}
      <section
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "80px 24px",
          position: "relative",
        }}
      >
        {/* Floating heart image */}
        
        <div
          style={{
            maxWidth: 800,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(12px)",
            borderRadius: "48px",
            padding: "48px 32px",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.3)",
          }}
        >
          <div
            style={{
              width: 90,
              height: 90,
              background: "rgba(211,47,47,0.2)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
              boxShadow: "0 0 0 4px rgba(211,47,47,0.3) ",
            }}
            className=" overflow-hidden"
          >
            <img className=" h-fit overflow-hidden" src="https://plus.unsplash.com/premium_photo-1719618754072-fc516f6698b1?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MXx8aGVhcnQlMjBpbWFnZXxlbnwwfHwwfHx8MA%3D%3D" alt="" />
           
              
          </div>
          <h1 style={{ fontSize: "3.8rem", fontWeight: 800, color: "#1e1e2f", marginBottom: 16, letterSpacing: "-0.02em" }}>
            CardioAI
          </h1>
          <p style={{ fontSize: "1.3rem", color: "#2d2d3a", marginBottom: 32, maxWidth: 600, marginLeft: "auto", marginRight: "auto", fontWeight: 500 }}>
            Clinical‑grade ECG interpretation powered by deep learning. Upload a signal and receive instant rhythm classification, heart rate metrics, and anomaly detection.
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              to="/dashboard"
              style={{
                background: "#d32f2f",
                color: "white",
                padding: "14px 36px",
                borderRadius: 40,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "1rem",
                transition: "all 0.2s",
                boxShadow: "0 8px 20px rgba(211,47,47,0.4)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#b71c1c")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#d32f2f")}
            >
              Go to Dashboard →
            </Link>
            <Link
              to="/about"
              style={{
                background: "rgba(255,255,255,0.9)",
                color: "#d32f2f",
                padding: "14px 36px",
                borderRadius: 40,
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "1rem",
                border: "1px solid #d32f2f",
                backdropFilter: "blur(4px)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(211,47,47,0.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.9)")}
            >
              Learn more
            </Link>
          </div>
        </div>

        {/* Second floating heart (bottom right) */}
        <div
          style={{
            position: "absolute",
            bottom: "10%",
            right: "5%",
            width: "100px",
            opacity: 0.25,
            animation: "floatHeart 8s ease-in-out infinite reverse",
            pointerEvents: "none",
          }}
        >
         
        </div>
      </section>

      {/* Features Section (semi-transparent) */}
      <section style={{ padding: "64px 24px", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(4px)", borderTop: "1px solid rgba(211,47,47,0.2)", borderBottom: "1px solid rgba(211,47,47,0.2)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "2.2rem", fontWeight: 700, color: "#1e1e2f", marginBottom: 48 }}>Why choose CardioAI?</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 32 }}>
            {[
              { icon: "⚡", title: "Real‑time analysis", desc: "Get rhythm classification, BPM, and anomaly flags in seconds." },
              { icon: "📊", title: "Clinical metrics", desc: "Heart rate, RR intervals, signal quality, and confidence scores." },
              { icon: "🔒", title: "Secure & private", desc: "Your data stays yours. Optional accounts save your history." },
              { icon: "🫀", title: "MIT‑BIH validated", desc: "Model trained on the gold‑standard arrhythmia database." },
            ].map((feat) => (
              <div key={feat.title} style={{ background: "white", borderRadius: 24, padding: 28, boxShadow: "0 12px 24px -8px rgba(0,0,0,0.1)", border: "1px solid rgba(0,0,0,0.05)", transition: "transform 0.2s" }}>
                <div style={{ fontSize: 44, marginBottom: 16 }}>{feat.icon}</div>
                <h3 style={{ fontSize: "1.3rem", fontWeight: 600, marginBottom: 12, color: "#212529" }}>{feat.title}</h3>
                <p style={{ color: "#6c757d", fontSize: "0.95rem", lineHeight: 1.5 }}>{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section style={{ padding: "80px 24px", textAlign: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}>
        <h2 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: 16, color: "white" }}>Ready to start?</h2>
        <p style={{ color: "#f0f0f0", marginBottom: 32, maxWidth: 500, marginLeft: "auto", marginRight: "auto", fontSize: "1.1rem" }}>
          Upload your first ECG or explore the demo – no account required.
        </p>
        <Link
          to="/dashboard"
          style={{
            background: "#d32f2f",
            color: "white",
            padding: "14px 42px",
            borderRadius: 40,
            textDecoration: "none",
            fontWeight: 700,
            fontSize: "1rem",
            display: "inline-block",
            boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#b71c1c")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#d32f2f")}
        >
          Launch Dashboard
        </Link>
      </section>

      

      {/* Animations */}
      <style>{`
        @keyframes floatHeart {
          0% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
      `}</style>
    </div>
  );
}