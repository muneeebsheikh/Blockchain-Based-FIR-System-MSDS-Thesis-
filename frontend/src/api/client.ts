import axios from "axios";

const baseURL = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export const TOKEN_KEY = "fir_token";

export const http = axios.create({ baseURL });

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type Role = "CITIZEN" | "OFFICER" | "ADMIN";

export async function login(email: string, password: string) {
  const { data } = await http.post<{ token: string; user: { id: string; email: string; role: Role } }>(
    "/api/auth/login",
    { email, password },
  );
  return data;
}

export async function register(email: string, password: string) {
  const { data } = await http.post<{ token: string; user: { id: string; email: string; role: Role } }>(
    "/api/auth/register",
    { email, password },
  );
  return data;
}

export type IntegritySignals = {
  rowMatchesCanonicalPayload: boolean;
  canonicalBlobMatchesStoredHash: boolean;
};

export type CanonicalFirPayload = {
  externalReference: string;
  title: string;
  description: string;
  locationText: string | null;
  incidentAt: string | null;
};

export type FirReceipt = {
  version: "v1";
  externalReference: string;
  contentHash: string;
  registeredAt: string;
  signature: string;
};

export type FirRow = {
  id: string;
  externalReference: string;
  title: string;
  description: string;
  locationText: string | null;
  incidentAt: string | null;
  canonicalPayloadJson: string;
  contentHash: string;
  receiptSignature?: string | null;
  chainTxHash: string | null;
  chainBlockNumber: number | null;
  anchoredAt?: string | null;
  merkleRoot?: string | null;
  merkleProof?: unknown;
  batchId?: string | null;
  integrityStatus: string;
  integritySignals: IntegritySignals;
  /** OK only if canonical hash + rows align; ignores chain unless you ran verify recently for chain-only issues. */
  effectiveIntegrity: string;
  createdAt: string;
  createdBy?: { id: string; email: string };
};

export function receiptFromFir(fir: FirRow): FirReceipt | null {
  if (!fir.receiptSignature) return null;
  return {
    version: "v1",
    externalReference: fir.externalReference,
    contentHash: fir.contentHash,
    registeredAt: fir.createdAt,
    signature: fir.receiptSignature,
  };
}

export function downloadReceipt(receipt: FirReceipt, filename?: string) {
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `fir-receipt-${receipt.externalReference.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function listFirs() {
  const { data } = await http.get<{ items: FirRow[] }>("/api/firs");
  return data.items;
}

export async function getFir(id: string) {
  const { data } = await http.get<FirRow>(`/api/firs/${id}`);
  return data;
}

export async function createFir(body: {
  title: string;
  description: string;
  locationText?: string;
  incidentAt?: string;
}) {
  const { data } = await http.post<{
    id: string;
    externalReference: string;
    contentHash: string;
    chainTxHash: string | null;
    chainBlockNumber: number | null;
    status: string;
    receipt: FirReceipt;
  }>("/api/firs", body);
  return data;
}

export type ReceiptVerifyResult = {
  signatureValid: boolean;
  recoveredAddress: string | null;
  signerMatchesSystem: boolean | null;
  systemSignerAddress: string;
  firFound: boolean;
  hashMatchesCurrentRecord: boolean | null;
  anchored: boolean | null;
  anchoredHashMatchesReceipt: boolean | null;
  fir: {
    id: string;
    title: string;
    integrityStatus: string;
    chainBlockNumber: number | null;
    merkleRoot: string | null;
    batchId: string | null;
  } | null;
};

export async function verifyReceipt(receipt: FirReceipt) {
  const { data } = await http.post<ReceiptVerifyResult>("/api/receipts/verify", receipt);
  return data;
}

export async function listMyFirs() {
  const { data } = await http.get<{ items: FirRow[] }>("/api/firs/mine");
  return data.items;
}

export async function getMyFir(id: string) {
  const { data } = await http.get<FirRow>(`/api/firs/mine/${id}`);
  return data;
}

export async function verifyMyFir(id: string) {
  const { data } = await http.post<VerifyResult>(`/api/firs/mine/${id}/verify`);
  return data;
}

export type VerifyResult = Awaited<ReturnType<typeof verifyFir>>;

export async function verifyFir(id: string) {
  const { data } = await http.post<{
    integrityStatus: string;
    dbMatchesCanonical: boolean;
    rowMatchesCanonicalPayload: boolean;
    anchoredOnChain: boolean;
    verificationMode: "merkle_batch" | "single_hash" | "pending";
    merkleProofValid: boolean | null;
    batchAnchoredOnChain: boolean | null;
    singleAnchoredOnChain: boolean | null;
    merkleRoot: string | null;
    batchId: string | null;
    proofLength: number | null;
    leafHash: string;
    storedContentHash: string;
    recomputedContentHash: string;
    recomputedFromRowHash: string;
  }>(`/api/firs/${id}/verify`);
  return data;
}

export type ChainFirNode = {
  id: string;
  title: string;
  externalReference: string;
  contentHash: string;
  /** DB record still hashes to (or proves into) the value anchored on-chain. */
  matchesChain: boolean;
};

export type ChainTxView = {
  hash: string;
  kind: "anchor" | "batch" | "deploy" | "other";
  anchoredHash: string | null;
  ref: string | null;
  firs: ChainFirNode[];
};

export type ChainBlockView = {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  transactions: ChainTxView[];
};

export type ChainOverview = {
  chainId: number;
  contractAddress: string;
  latestBlock: number;
  totalAnchors: number;
  blocks: ChainBlockView[];
};

export async function getChain() {
  const { data } = await http.get<ChainOverview>("/api/firs/chain");
  return data;
}

export async function createFirBatch(
  items: {
    title: string;
    description: string;
    locationText?: string;
    incidentAt?: string;
  }[],
) {
  const { data } = await http.post<{
    batchId: string;
    merkleRoot: string;
    chainTxHash: string;
    chainBlockNumber: number;
    items: {
      id: string;
      externalReference: string;
      contentHash: string;
      merkleRoot: string | null;
      proofLength: number;
    }[];
  }>("/api/firs/batch", { items });
  return data;
}
