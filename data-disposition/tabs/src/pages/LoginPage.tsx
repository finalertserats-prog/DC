import React, { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../contexts/AuthContext";

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      login(data.token, data.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    background: "#424242",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    padding: "13px 16px",
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    outline: "none",
    caretColor: "white",
  };

  return (
    <div style={{ height: "100vh", width: "100vw", background: "#212121", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        style={{
          width: 440,
          background: "#2f2f2f",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          padding: "44px 40px 40px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <img src="/bot.png" alt="Nova AI" style={{ width: 48, height: 48, objectFit: "contain" }} />
        </div>

        {/* Title */}
        <h1 style={{ textAlign: "center", fontSize: 26, fontWeight: 600, color: "#ffffff", margin: "0 0 8px", letterSpacing: "-0.02em" }}>
          Welcome back
        </h1>
        <p style={{ textAlign: "center", fontSize: 14, color: "rgba(255,255,255,0.45)", margin: "0 0 32px" }}>
          Sign in to your Nova account
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Email */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              disabled={loading}
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.55)"; }}
              onBlur={e => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.15)"; }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading}
                style={{ ...inputStyle, paddingRight: 44 }}
                onFocus={e => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.55)"; }}
                onBlur={e => { e.currentTarget.style.border = "1px solid rgba(255,255,255,0.15)"; }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: "rgba(255,255,255,0.35)", padding: 0,
                }}
              >
                {showPw ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              style={{
                padding: "10px 14px", borderRadius: 8, fontSize: 13,
                background: "rgba(255,60,60,0.10)", border: "1px solid rgba(255,60,60,0.22)",
                color: "rgba(255,140,140,0.9)",
              }}
            >
              {error}
            </motion.div>
          )}

          {/* Submit — white button like ChatGPT */}
          <motion.button
            type="submit"
            disabled={loading}
            whileHover={!loading ? { opacity: 0.9 } : undefined}
            whileTap={!loading ? { scale: 0.98 } : undefined}
            style={{
              marginTop: 8,
              width: "100%", padding: "13px 0", borderRadius: 8, border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: 600, fontSize: 15,
              color: loading ? "rgba(0,0,0,0.45)" : "#000000",
              background: loading ? "rgba(255,255,255,0.5)" : "#ffffff",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "background 0.15s",
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: "2px solid rgba(0,0,0,0.2)", borderTopColor: "#000",
                  display: "inline-block", animation: "spin 0.8s linear infinite",
                }} />
                Signing in…
              </>
            ) : "Continue"}
          </motion.button>
        </form>
      </motion.div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

export default LoginPage;
