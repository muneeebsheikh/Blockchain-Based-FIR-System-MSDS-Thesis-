import crypto from "node:crypto";

export type FirPayload = {
  externalReference: string;
  title: string;
  description: string;
  locationText: string | null;
  incidentAt: string | null;
};

export function canonicalizePayload(payload: FirPayload): string {
  const sorted: FirPayload = {
    description: payload.description,
    externalReference: payload.externalReference,
    incidentAt: payload.incidentAt,
    locationText: payload.locationText,
    title: payload.title,
  };
  return JSON.stringify(sorted);
}

/** 0x-prefixed 32-byte hex SHA-256 digest of the canonical JSON string. */
export function sha256Bytes32Hex(canonicalJson: string): `0x${string}` {
  const digest = crypto.createHash("sha256").update(canonicalJson, "utf8").digest();
  return `0x${digest.toString("hex")}` as `0x${string}`;
}

export function firContentHash(payload: FirPayload): `0x${string}` {
  return sha256Bytes32Hex(canonicalizePayload(payload));
}

/** Rebuild the signed payload from editable DB columns (for drift vs canonical JSON). */
export function firPayloadFromRow(row: {
  externalReference: string;
  title: string;
  description: string;
  locationText: string | null;
  incidentAt: Date | null;
}): FirPayload {
  return {
    externalReference: row.externalReference,
    title: row.title,
    description: row.description,
    locationText: row.locationText ?? null,
    incidentAt: row.incidentAt ? row.incidentAt.toISOString() : null,
  };
}
