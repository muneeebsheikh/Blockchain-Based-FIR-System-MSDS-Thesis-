import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { createFir, downloadReceipt } from "../api/client";

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

  const pending = result?.status === "PENDING";

  return (
    <main className="panel wide">
      <h1>Submit FIR (citizen)</h1>
      <p className="muted">
        Full narrative stays in PostgreSQL. A SHA-256 fingerprint is signed as a receipt immediately; the batch
        worker anchors it on the blockchain shortly after.
      </p>
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
            {pending ? (
              <p className="success">
                <strong>✓ FIR registered. Pending blockchain anchoring.</strong> A batch worker will commit it
                under a Merkle root within about 30 seconds.
              </p>
            ) : (
              <p className="success">
                <strong>✓ FIR submitted and secured on the blockchain</strong>
                {result.chainBlockNumber != null ? ` (block #${result.chainBlockNumber})` : ""}.
              </p>
            )}
            <p className="muted mono wrap">Fingerprint: {result.contentHash}</p>
            <div className="citizen-actions">
              <button type="button" onClick={() => downloadReceipt(result.receipt)}>
                Download receipt
              </button>
              <Link to={`/my-firs/${result.id}`}>View your FIR and its integrity status →</Link>
            </div>
          </div>
        )}
        <button type="submit">{pending ? "Submit another FIR" : "Submit FIR"}</button>
      </form>
    </main>
  );
}
