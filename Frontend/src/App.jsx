import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Dashboard from "./Dashboard.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Login from "./Page/Login.jsx";
import Patients from "./Page/Patients.jsx";
import Signup from "./Page/Signup.jsx";
import Home from "./Page/Home.jsx";
import ECGImageUpload from './Page/ECGImageUpload.jsx'

function BootGate({ children }) {
  const { bootstrapping } = useAuth();
  if (bootstrapping) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0a0d12",
        color: "#9ca3af",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        Loading…
      </div>
    );
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BootGate>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload" element={<ECGImageUpload/>}/>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BootGate>
      </AuthProvider>
    </BrowserRouter>
  );
}
