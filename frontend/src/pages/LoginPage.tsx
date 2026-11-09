import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const { setSession } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const data = await login(email, password);
      setSession(data.token, data.user);
      if (data.user.role === "CITIZEN") nav("/my-firs");
      else nav("/queue");
    } catch {
      setError("Login failed.");
    }
  }

  return (
    <main className="panel">
      <h1>Sign in</h1>
      <form onSubmit={onSubmit} className="stack">
        <label className="field">
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit">Continue</button>
      </form>
      <p className="muted">
        New citizen account? <Link to="/register">Register</Link>
      </p>
    </main>
  );
}
