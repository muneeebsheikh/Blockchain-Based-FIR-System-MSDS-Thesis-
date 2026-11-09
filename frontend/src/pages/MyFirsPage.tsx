import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyFirs, type FirRow } from "../api/client";
import { anchoredPayload, citizenStatus, shortHash } from "./citizenStatus";

export function MyFirsPage() {
  const [items, setItems] = useState<FirRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listMyFirs();
        if (!cancelled) setItems(rows);
      } catch {
        if (!cancelled) setError("Could not load your FIRs. Ensure the API is running.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const secured = items?.filter((f) => citizenStatus(f).tone === "ok").length ?? 0;
  const alerts = items?.filter((f) => citizenStatus(f).tone === "bad").length ?? 0;

  return (
    <main className="panel citizen-page">
      <div className="citizen-head">
        <div>
          <h1>My FIRs</h1>
          <p className="muted">
            Every FIR you submit is fingerprinted and recorded on the blockchain. Open one to check that it has not
            been changed.
          </p>
        </div>
        <Link to="/submit" className="citizen-cta">
          + Submit new FIR
        </Link>
      </div>

      {error && <p className="error">{error}</p>}

      {items && items.length > 0 && (
        <div className="citizen-summary">
          <div className="citizen-summary-item">
            <strong>{items.length}</strong>
            <span className="muted">submitted</span>
          </div>
          <div className="citizen-summary-item ok">
            <strong>{secured}</strong>
            <span className="muted">secured</span>
          </div>
          <div className={`citizen-summary-item ${alerts > 0 ? "bad" : ""}`}>
            <strong>{alerts}</strong>
            <span className="muted">integrity alerts</span>
          </div>
        </div>
      )}

      {items && items.length === 0 && (
        <div className="card citizen-empty">
          <p>You have not submitted any FIRs yet.</p>
          <Link to="/submit">Submit your first FIR</Link>
        </div>
      )}

      {items && items.length > 0 && (
        <table className="table citizen-table">
          <thead>
            <tr>
              <th>FIR</th>
              <th>Submitted</th>
              <th>Blockchain record</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((f) => {
              const s = citizenStatus(f);
              return (
                <tr key={f.id}>
                  <td>
                    <strong>{anchoredPayload(f)?.title ?? f.title}</strong>
                    <div className="muted mono">Ref {shortHash(f.externalReference, 8, 4)}</div>
                  </td>
                  <td>{new Date(f.createdAt).toLocaleString()}</td>
                  <td>
                    {f.chainBlockNumber != null ? (
                      <>
                        Block #{f.chainBlockNumber}
                        <div className="muted">{f.merkleRoot ? "Batch (Merkle)" : "Individual"}</div>
                      </>
                    ) : (
                      <span className="muted">n/a</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-badge ${s.tone}`} title={s.hint}>
                      {s.tone === "ok" ? "✓ " : s.tone === "bad" ? "✗ " : ""}
                      {s.label}
                    </span>
                  </td>
                  <td>
                    <Link to={`/my-firs/${f.id}`}>View</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
