import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listFirs, type FirRow } from "../api/client";

export function OfficerQueuePage() {
  const [items, setItems] = useState<FirRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listFirs();
        if (!cancelled) setItems(rows);
      } catch {
        if (!cancelled) setError("Could not load FIR list.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="panel wide">
      <h1>FIR queue (officer / admin)</h1>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Reference</th>
            <th>Title (anchored)</th>
            <th>Integrity (effective)</th>
            <th>Submitted</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((f) => (
            <tr key={f.id}>
              <td className="mono">{f.externalReference}</td>
              <td title={f.title !== anchoredTitle(f) ? "DB title column differs from anchored payload." : undefined}>{anchoredTitle(f)}</td>
              <td title={digestHint(f)}>
                {f.effectiveIntegrity}
                {!f.integritySignals?.rowMatchesCanonicalPayload ? " ⚠" : ""}
              </td>
              <td>{new Date(f.createdAt).toLocaleString()}</td>
              <td>
                <Link to={`/firs/${f.id}`}>Open</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && !error && <p className="muted">No records yet.</p>}
    </main>
  );
}

function digestHint(f: {
  effectiveIntegrity: string;
  integritySignals?: { rowMatchesCanonicalPayload: boolean };
}) {
  if (!f.integritySignals?.rowMatchesCanonicalPayload)
    return "Editable columns diverge from anchored JSON.";
  return "Columns match anchored payload; verify on detail for chain check.";
}

function anchoredTitle(f: FirRow) {
  try {
    const o = JSON.parse(f.canonicalPayloadJson) as { title?: string };
    if (typeof o.title === "string") return o.title;
  } catch {
    /* ignore */
  }
  return f.title;
}
