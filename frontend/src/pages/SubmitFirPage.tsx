import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createFir } from "../api/client";

export function SubmitFirPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [incidentAt, setIncidentAt] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof createFir>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    try {
      const payload: Parameters<typeof createFir>[0] = { title, description };
      if (locationText.trim()) payload.locationText = locationText.trim();
      if (incidentAt) payload.incidentAt = new Date(incidentAt).toISOString();
      const data = await createFir(payload);
      setResult(data);
      setTitle("");
      setDescription("");
      setLocationText("");
      setIncidentAt("");
    } catch {
      setError("Submission failed. Ensure the API, database, and chain are running with a valid contract address.");
    }
  }

  return (
    <main className="panel wide">
      <h1>Submit FIR (citizen)</h1>
      <p className="muted">Full narrative stays in PostgreSQL; a SHA-256 digest is anchored on-chain.</p>
      <form onSubmit={onSubmit} className="stack">
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required minLength={10} rows={8} />
        </label>
        <label className="field">
          <span>Location (optional)</span>
          <input value={locationText} onChange={(e) => setLocationText(e.target.value)} />
        </label>
        <label className="field">
          <span>Incident time (optional)</span>
          <input value={incidentAt} onChange={(e) => setIncidentAt(e.target.value)} type="datetime-local" />
        </label>
        {error && <p className="error">{error}</p>}
        {result && (
          <div className="card success-card">
            <p className="success">
              <strong>✓ FIR submitted and secured on the blockchain</strong>
              {result.chainBlockNumber != null ? ` (block #${result.chainBlockNumber})` : ""}.
            </p>
            <p className="muted mono wrap">Fingerprint: {result.contentHash}</p>
            <Link to={`/my-firs/${result.id}`}>View your FIR and its integrity status →</Link>
          </div>
        )}
        <button type="submit">Submit and anchor</button>
      </form>
    </main>
  );
}
