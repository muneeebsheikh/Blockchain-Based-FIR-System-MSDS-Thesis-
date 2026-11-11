import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { type CanonicalFirPayload, getFir, verifyFir } from "../api/client";

function parseCanonicalPayload(json: string): CanonicalFirPayload | null {
  try {
    const o = JSON.parse(json) as CanonicalFirPayload;
    if (typeof o.title !== "string" || typeof o.description !== "string") return null;
    return o;
  } catch {
    return null;
  }
}

export function FirDetailPage() {
  const { id } = useParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<Awaited<ReturnType<typeof verifyFir>> | null>(null);
  const [fir, setFir] = useState<Awaited<ReturnType<typeof getFir>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        const row = await getFir(id);
        if (!cancelled) setFir(row);
      } catch {
        if (!cancelled) setError("Record not found.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function onVerify() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const v = await verifyFir(id);
      setVerify(v);
      const row = await getFir(id);
      setFir(row);
    } catch {
      setError("Verification call failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!fir) {
    return (
      <main className="panel">
        {error && <p className="error">{error}</p>}
        {!error && <p className="muted">Loading…</p>}
        <p>
          <Link to="/queue">Back</Link>
        </p>
      </main>
    );
  }

  const anchored = parseCanonicalPayload(fir.canonicalPayloadJson);
  const drift = fir.integritySignals && !fir.integritySignals.rowMatchesCanonicalPayload;
  const canonicalBroken =
    fir.integritySignals && !fir.integritySignals.canonicalBlobMatchesStoredHash;

  return (
    <main className="panel wide">
      <p>
        <Link to="/queue">Back to queue</Link>
      </p>

      {(drift || canonicalBroken || fir.effectiveIntegrity === "TAMPERED") && (
        <div className="banner-warn stack">
          <strong>Integrity warning</strong>
          {canonicalBroken && (
            <p>
              Stored canonical JSON no longer matches <code>contentHash</code> (possible DB corruption).
            </p>
          )}
          {drift && (
            <p>
              Editable columns (title, description, etc.) diverge from the <strong>anchored JSON snapshot</strong>{" "}
              that was hashed and written to the chain. The UI below shows both: trust the&nbsp;
              <strong>anchored</strong> copy for legal meaning of the anchor.
            </p>
          )}
          {!canonicalBroken && !drift && fir.effectiveIntegrity === "TAMPERED" && (
            <p>Stored status is TAMPERED (e.g. chain check failed — run verification for details).</p>
          )}
        </div>
      )}

      <h1>{anchored?.title ?? fir.title}</h1>
      <p className="muted">Reference: {fir.externalReference}</p>
      <p className="muted">
        Effective integrity: <strong>{fir.effectiveIntegrity}</strong> (stored&nbsp;
        <code>{fir.integrityStatus}</code>)
      </p>

      <section className="stack">
        <h2>Anchored record (matches blockchain hash)</h2>
        {!anchored ? (
          <p className="error">Could not parse canonical payload JSON.</p>
        ) : (
          <>
            <p>{anchored.description}</p>
            {anchored.locationText && <p>Location: {anchored.locationText}</p>}
            {anchored.incidentAt && (
              <p>Incident: {new Date(anchored.incidentAt).toLocaleString()}</p>
            )}
          </>
        )}
      </section>

      {drift && (
        <section className="stack muted-block">
          <h2>Database columns (unchecked — edited outside anchored snapshot)</h2>
          <p>{fir.description}</p>
          {fir.locationText && <p>Location: {fir.locationText}</p>}
          {fir.incidentAt && <p>Incident: {new Date(fir.incidentAt).toLocaleString()}</p>}
        </section>
      )}

      <section className="stack">
        <h2>Chain anchor</h2>
        <p className="mono wrap">Leaf / content hash: {fir.contentHash}</p>
        {fir.merkleRoot && (
          <>
            <p>
              Mode: <strong>Merkle batch</strong> (batch&nbsp;
              <span className="mono wrap">{fir.batchId ?? "n/a"}</span>)
            </p>
            <p className="mono wrap">Merkle root: {fir.merkleRoot}</p>
            <p>
              Proof steps:{" "}
              {Array.isArray(fir.merkleProof) ? fir.merkleProof.length : "n/a"}
            </p>
          </>
        )}
        {!fir.merkleRoot && fir.chainBlockNumber != null && (
          <p>
            Mode: <strong>single-hash</strong> (Phase I)
          </p>
        )}
        {!fir.merkleRoot && fir.chainBlockNumber == null && (
          <p>
            Mode: <strong>pending batch</strong> — waiting for the background worker to call{" "}
            <code>anchorBatch</code>
          </p>
        )}
        <p>
          Tx: <span className="mono wrap">{fir.chainTxHash ?? "n/a"}</span>
        </p>
        <p>Block: {fir.chainBlockNumber ?? "n/a"}</p>
        {fir.receiptSignature && (
          <p className="muted mono wrap">Receipt signature: {fir.receiptSignature.slice(0, 20)}…</p>
        )}
        <button type="button" onClick={onVerify} disabled={busy}>
          {busy ? "Checking…" : "Full verification (DB + chain)"}
        </button>
        {error && <p className="error">{error}</p>}
        {verify && (
          <div className="card">
            <p>
              Result: <strong>{verify.integrityStatus}</strong> ({verify.verificationMode})
            </p>
            <p>Canonical JSON matches stored hash: {String(verify.dbMatchesCanonical)}</p>
            <p>DB columns match canonical JSON: {String(verify.rowMatchesCanonicalPayload)}</p>
            <p>Overall on-chain commitment OK: {String(verify.anchoredOnChain)}</p>
            {verify.verificationMode === "merkle_batch" && (
              <>
                <p>Merkle proof valid (leaf → root): {String(verify.merkleProofValid)}</p>
                <p>Batch root anchored on-chain: {String(verify.batchAnchoredOnChain)}</p>
                <p>Proof length: {verify.proofLength ?? "n/a"}</p>
                <p className="mono wrap">Leaf: {verify.leafHash}</p>
                <p className="mono wrap">Root: {verify.merkleRoot ?? "n/a"}</p>
              </>
            )}
            {verify.verificationMode === "single_hash" && (
              <p>Single hash present on-chain: {String(verify.singleAnchoredOnChain)}</p>
            )}
            {verify.verificationMode === "pending" && (
              <p>Still pending batch anchor — not marked TAMPERED solely for missing chain record.</p>
            )}
            <p className="mono wrap">Stored: {verify.storedContentHash}</p>
            <p className="mono wrap">Hash from canonical: {verify.recomputedContentHash}</p>
            <p className="mono wrap">Hash from current columns: {verify.recomputedFromRowHash}</p>
          </div>
        )}
      </section>
    </main>
  );
}
