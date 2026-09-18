import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../api/client.js";

export default function Login() {
  const { user, needsSetup, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (needsSetup) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src="/icon.svg" alt="" className="auth-icon" />
        <h1>Shux</h1>
        <p className="muted">Sign in to your library.</p>
        {error && <div className="error">{error}</div>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
