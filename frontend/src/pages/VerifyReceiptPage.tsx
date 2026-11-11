import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { verifyReceipt, type FirReceipt, type ReceiptVerifyResult } from "../api/client";

export function VerifyReceiptPage() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReceiptVerifyResult | null>(null);

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    let receipt: FirReceipt;
    try {
      receipt = JSON.parse(text) as FirReceipt;
    } catch {
      setError("Paste a valid JSON receipt.");
      return;
    }
    setBusy(true);
    try {
      setResult(await verifyReceipt(receipt));
    } catch {
      setError("Verification request failed. Ensure the API is running.");
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  return (
    <main className="panel wide">
      <h1>Verify FIR receipt</h1>
      <p className="muted">
        Paste or upload the JSON receipt given at registration. No sign-in required. A valid signature proves the
        police server acknowledged that fingerprint at that time; comparing it to the database and chain detects
        later tampering.
      </p>

      <form onSubmit={onVerify} className="stack">
        <label className="field">
          <span>Receipt JSON</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder='{"version":"v1","externalReference":"...","contentHash":"0x...","registeredAt":"...","signature":"0x..."}'
            required
          />
        </label>
        <label className="field">
          <span>Or upload a .json file</span>
          <input type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Checking…" : "Verify receipt"}
        </button>
      </form>

      {result && (
        <section className="card stack" style={{ marginTop: "1rem" }}>
          <h2>Result</h2>
          <ul className="check-list">
            <Check
              ok={result.signatureValid && result.signerMatchesSystem === true}
              label="Cryptographic signature is valid and matches the system signer"
            />
            <Check ok={result.firFound} label="An FIR with this reference exists in the database" />
            <Check
              ok={result.hashMatchesCurrentRecord}
              label="Receipt fingerprint still matches the database content hash"
            />
            <Check
              ok={result.anchored}
              label="FIR has been anchored on the blockchain"
              pending={result.firFound && result.anchored === false}
            />
            {result.anchored && (
              <Check
                ok={result.anchoredHashMatchesReceipt}
                label="Anchored database hash still matches the receipt fingerprint"
              />
            )}
          </ul>
          {result.fir && (
            <p className="muted">
              Linked FIR: <strong>{result.fir.title}</strong> (status {result.fir.integrityStatus}
              {result.fir.chainBlockNumber != null ? `, block #${result.fir.chainBlockNumber}` : ""})
              {result.fir.id && (
                <>
                  {" · "}
                  <Link to={`/my-firs/${result.fir.id}`}>Open if you own it</Link>
                </>
              )}
            </p>
          )}
          <p className={`citizen-verdict ${verdictTone(result)}`}>
            {verdictText(result)}
          </p>
        </section>
      )}
    </main>
  );
}

function Check({ ok, label, pending }: { ok: boolean | null; label: string; pending?: boolean }) {
  const tone = pending ? "pending" : ok ? "ok" : "bad";
  return (
    <li className={tone}>
      <span className="check-icon">{pending ? "…" : ok ? "✓" : "✗"}</span>
      {label}
    </li>
  );
}

function verdictTone(r: ReceiptVerifyResult): "ok" | "bad" | "pending" {
  if (!r.signatureValid || r.signerMatchesSystem !== true) return "bad";
  if (r.firFound && r.hashMatchesCurrentRecord === false) return "bad";
  if (r.anchored && r.anchoredHashMatchesReceipt === false) return "bad";
  if (r.firFound && r.anchored === false) return "pending";
  if (r.signatureValid && r.signerMatchesSystem && r.hashMatchesCurrentRecord && r.anchored) return "ok";
  return "pending";
}

function verdictText(r: ReceiptVerifyResult): string {
  if (!r.signatureValid || r.signerMatchesSystem !== true) {
    return "Invalid receipt: signature check failed. The file may have been altered or forged.";
  }
  if (r.firFound && r.hashMatchesCurrentRecord === false) {
    return "Tamper detected: the database content hash no longer matches the receipt fingerprint.";
  }
  if (r.anchored && r.anchoredHashMatchesReceipt === false) {
    return "Tamper detected: the on-chain anchored record does not match this receipt.";
  }
  if (r.firFound && r.anchored === false) {
    return "Receipt is authentic. Blockchain anchoring is still pending for this FIR.";
  }
  if (r.signatureValid && r.signerMatchesSystem && r.hashMatchesCurrentRecord && r.anchored) {
    return "Receipt is authentic and the FIR matches the blockchain record.";
  }
  if (!r.firFound) {
    return "Signature is valid, but no matching FIR was found in this database.";
  }
  return "Partial verification complete.";
}
