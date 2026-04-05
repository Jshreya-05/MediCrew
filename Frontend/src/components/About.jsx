// About.jsx
import { Link } from "react-router-dom";
import Footer from "./Footer";

export default function About() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#ffffff" }}>
      <div style={{ flex: 1, maxWidth: 900, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ marginBottom: 40 }}>
          <Link to="/" style={{ color: "#d32f2f", textDecoration: "none", fontSize: 14 }}>← Back to Home</Link>
        </div>
        <h1 style={{ fontSize: "2.5rem", fontWeight: 700, color: "#212529", marginBottom: 24 }}>About CardioAI</h1>
        
        <div style={{ fontSize: "1rem", color: "#495057", lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 24 }}>
          <p>
            <strong>CardioAI</strong> is a clinical decision support tool that uses a deep neural network to classify 
            cardiac rhythms from single‑lead ECG signals. It is designed for researchers, clinicians, and students 
            who need fast, interpretable arrhythmia detection.
          </p>

          <div style={{ background: "#f8f9fa", padding: 24, borderRadius: 16, borderLeft: "4px solid #d32f2f" }}>
            <h3 style={{ fontSize: "1.2rem", marginBottom: 12, color: "#212529" }}>📈 Model & Data</h3>
            <p>
              Our classifier is trained on the <strong>MIT‑BIH Arrhythmia Database</strong> (48 half‑hour ECG recordings) 
              and validated on the <strong>MIT‑BIH Atrial Fibrillation Database</strong>. The model achieves:
            </p>
            <ul style={{ marginTop: 12, marginLeft: 24 }}>
              <li>97% accuracy for Normal Sinus Rhythm vs. AFib vs. VFib</li>
              <li>Real‑time R‑peak detection (Pan‑Tompkins inspired) for heart rate estimation</li>
              <li>Anomaly flagging based on model uncertainty and signal quality</li>
            </ul>
          </div>

          <div>
            <h3 style={{ fontSize: "1.2rem", marginBottom: 12, color: "#212529" }}>⚙️ How it works</h3>
            <ol style={{ marginLeft: 24 }}>
              <li style={{ marginBottom: 8 }}>Upload a CSV/JSON file containing raw ECG voltage samples (≥50 samples).</li>
              <li style={{ marginBottom: 8 }}>The signal is pre‑processed (filtered, normalized, segmented into 187‑sample windows).</li>
              <li style={{ marginBottom: 8 }}>A 1D convolutional neural network outputs probabilities for NSR, AFib, or VFib.</li>
              <li style={{ marginBottom: 8 }}>Peak detection computes heart rate, RR intervals, and signal quality index.</li>
              <li>Results are displayed with visual ECG scrolling, probability bars, and clinical alerts.</li>
            </ol>
          </div>

          <div style={{ background: "#ffffff", border: "1px solid #e9ecef", borderRadius: 16, padding: 20 }}>
            <h3 style={{ fontSize: "1.2rem", marginBottom: 12, color: "#212529" }}>⚠️ Important Disclaimer</h3>
            <p style={{ color: "#6c757d", fontSize: "0.9rem" }}>
              CardioAI is a <strong>research and educational tool</strong>. It is not FDA‑cleared or CE‑marked for 
              clinical diagnosis. All interpretations should be reviewed by a qualified healthcare professional. 
              The developer assumes no liability for decisions made based on this software.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: "1.2rem", marginBottom: 12, color: "#212529" }}>👨‍⚕️ For Clinicians</h3>
            <p>
              You can create a free account to save patient‑linked analyses, review historical ECGs, and export 
              reports. The system respects patient privacy – no data is shared with third parties.
            </p>
            <div style={{ marginTop: 20 }}>
              <Link
                to="/signup"
                style={{
                  background: "#d32f2f",
                  color: "white",
                  padding: "10px 24px",
                  borderRadius: 40,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Create free account →
              </Link>
            </div>
          </div>
        </div>
      </div>
     
    </div>
  );
}