// ToastNotification.jsx
import { useEffect } from "react";

export default function ToastNotification({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, 4200);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 28,
        right: 28,
        zIndex: 200,
        padding: "12px 18px",
        borderRadius: 10,
        background: "rgba(211,47,47,0.12)",
        border: "1px solid rgba(211,47,47,0.35)",
        color: "#d32f2f",
        fontSize: 14,
        fontWeight: 600,
        boxShadow: "0 8px 32px rgba(0,0,0,0.1)",
        animation: "toastSlide 0.35s ease",
      }}
    >
      ✓ {message}
    </div>
  );
}