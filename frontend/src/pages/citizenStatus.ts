import type { CanonicalFirPayload, FirRow } from "../api/client";

export type CitizenStatus = { tone: "ok" | "bad" | "pending"; label: string; hint: string };

export function citizenStatus(f: FirRow): CitizenStatus {
  if (f.effectiveIntegrity === "TAMPERED" || f.integrityStatus === "TAMPERED") {
    return {
      tone: "bad",
      label: "Integrity alert",
      hint: "The stored record no longer matches the fingerprint recorded on the blockchain.",
    };
  }
  if (f.chainBlockNumber == null) {
    return { tone: "pending", label: "Pending", hint: "Not yet recorded on the blockchain." };
  }
  return {
    tone: "ok",
    label: "Secured on blockchain",
    hint: "Your FIR's fingerprint is recorded on the blockchain and the record is unchanged.",
  };
}

export function anchoredPayload(f: FirRow): CanonicalFirPayload | null {
  try {
    return JSON.parse(f.canonicalPayloadJson) as CanonicalFirPayload;
  } catch {
    return null;
  }
}

export function shortHash(hash: string | null | undefined, head = 8, tail = 6) {
  if (!hash) return "n/a";
  return hash.length <= head + tail + 2 ? hash : `${hash.slice(0, head + 2)}…${hash.slice(-tail)}`;
}
