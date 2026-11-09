import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getMyFir, verifyMyFir, type FirRow, type VerifyResult } from "../api/client";
import { anchoredPayload, citizenStatus, shortHash } from "./citizenStatus";

export function MyFirDetailPage() {
  const { id } = useParams();
  const [fir, setFir] = useState<FirRow | null>(null);
  const [check, setCheck] = useState<VerifyResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    if (!id) return;
    setChecking(true);
    try {
      setCheck(await verifyMyFir(id));
      setFir(await getMyFir(id));
      setError(null);
    } catch {
      setError("The integrity check could not reach the blockchain. Please try again later.");
    } finally {
      setChecking(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const row = await getMyFir(id);
        if (cancelled) return;
        setFir(row);
        void runCheck();
      } catch {
        if (!cancelled) setError("FIR not found.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, runCheck]);

  if (!fir) {
    return (
      <main className="panel citizen-page">
        {error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}
        <Link to="/my-firs">← Back to My FIRs</Link>
      </main>
    );
  }

  const original = anchoredPayload(fir);
  const status = citizenStatus(fir);
  const textUnchanged = check ? check.dbMatchesCanonical && check.rowMatchesCanonicalPayload : null;
  const drift = !fir.integritySignals.rowMatchesCanonicalPayload;

  return (
    <main className="panel citizen-page">
      <Link to="/my-firs">← Back to My FIRs</Link>

      <div className={`citizen-banner ${status.tone}`}>
        <div className="citizen-banner-icon">{status.tone === "ok" ? "✓" : status.tone === "bad" ? "!" : "…"}</div>
        <div>
          <h1>{original?.title ?? fir.title}</h1>
          <p>
            <strong>{status.label}.</strong> {status.hint}
          </p>
        </div>
      </div>

      <div className="citizen-grid">
        <section className="card stack">
          <h2>Your complaint (as originally registered)</h2>
          {original ? (
            <>
              <p className="citizen-narrative">{original.description}</p>
              <dl className="citizen-dl">
                {original.locationText && (
                  <>
                    <dt>Location</dt>
                    <dd>{original.locationText}</dd>
                  </>
                )}
                {original.incidentAt && (
                  <>
                    <dt>Incident time</dt>
                    <dd>{new Date(original.incidentAt).toLocaleString()}</dd>
                  </>
                )}
                <dt>Submitted</dt>
                <dd>{new Date(fir.createdAt).toLocaleString()}</dd>
                <dt>Reference</dt>
                <dd className="mono">{fir.externalReference}</dd>
              </dl>
            </>
          ) : (
            <p className="error">The registered record could not be read.</p>
          )}

          {drift && (
            <div className="banner-warn">
              <strong>The stored copy differs from what you submitted:</strong>
              <p className="citizen-narrative">{fir.description}</p>
            </div>
          )}
        </section>

        <section className="card stack">
          <h2>Blockchain record</h2>
          <dl className="citizen-dl">
            <dt>Recorded</dt>
            <dd>
              {fir.chainBlockNumber != null ? `Block #${fir.chainBlockNumber}` : "n/a"}
              {fir.anchoredAt ? ` · ${new Date(fir.anchoredAt).toLocaleString()}` : ""}
            </dd>
            <dt>Method</dt>
            <dd>{fir.merkleRoot ? "Batch (Merkle tree)" : "Individual fingerprint"}</dd>
            <dt>Fingerprint</dt>
            <dd className="mono wrap" title={fir.contentHash}>
              {fir.contentHash}
            </dd>
            {fir.merkleRoot && (
              <>
                <dt>Batch root</dt>
                <dd className="mono wrap">{fir.merkleRoot}</dd>
              </>
            )}
            <dt>Transaction</dt>
            <dd className="mono" title={fir.chainTxHash ?? ""}>
              {shortHash(fir.chainTxHash)}
            </dd>
          </dl>
          <p className="muted citizen-explain">
            The fingerprint is a SHA-256 hash of your FIR. Any change to the text, even one letter, produces a
            completely different fingerprint, so changes can always be detected.
          </p>
        </section>
      </div>

      <section className="card stack">
        <div className="citizen-check-head">
          <h2>Integrity check</h2>
          <button type="button" onClick={() => void runCheck()} disabled={checking}>
            {checking ? "Checking…" : "Check again"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        {!check && !error && <p className="muted">Checking your FIR against the blockchain…</p>}
        {check && (
          <>
            <ul className="check-list">
              <CheckItem ok={textUnchanged} label="Your FIR text is unchanged since you submitted it" />
              {check.verificationMode === "merkle_batch" && (
                <CheckItem
                  ok={check.merkleProofValid}
                  label="Your FIR's proof links it to the batch recorded on the blockchain"
                />
              )}
              <CheckItem ok={check.anchoredOnChain} label="The fingerprint is recorded on the blockchain" />
            </ul>
            <p className={`citizen-verdict ${check.integrityStatus === "OK" ? "ok" : "bad"}`}>
              {check.integrityStatus === "OK"
                ? "Verified: your FIR is authentic and has not been altered."
                : "Warning: your FIR record has been altered after registration. Please contact the police station or keep this page as evidence."}
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function CheckItem({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <li className={ok ? "ok" : "bad"}>
      <span className="check-icon">{ok ? "✓" : "✗"}</span>
      {label}
    </li>
  );
}
