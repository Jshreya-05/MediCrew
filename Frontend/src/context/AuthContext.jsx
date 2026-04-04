import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../config.js";

const TOKEN_KEY = "medicrew_token";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(!!localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    if (!token) {
      setUser(null);
      setBootstrapping(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!r.ok) throw new Error("session");
        const data = await r.json();
        if (!cancelled) setUser(data);
      } catch {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const login = useCallback((newToken, profile) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(profile);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, bootstrapping, login, logout }),
    [user, token, bootstrapping, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
