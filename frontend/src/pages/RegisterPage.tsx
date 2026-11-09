import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function RegisterPage() {
  const { setSession } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const data = await register(email, password);
      setSession(data.token, data.user);
      nav("/submit");
    } catch {
      setError("Registration failed.");
    }
  }

  return (
    <main className="panel">
      <h1>Create citizen account</h1>
      <form onSubmit={onSubmit} className="stack">
        <label className="field">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label className="field">
          <span>Password (min 8)</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={8} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Create account</button>
      </form>
      <p className="muted">
        Already have access? <Link to="/login">Sign in</Link>
      </p>
    </main>
  );
}
