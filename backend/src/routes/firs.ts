import { Router } from "express";
import { z } from "zod";
import { Role, type Fir, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { Env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import {
  canonicalizePayload,
  firContentHash,
  firPayloadFromRow,
  type FirPayload,
} from "../lib/hashCanonical.js";
import {
  anchorBatchOnChain,
  anchorOnChain,
  getChainClients,
  readChainOverview,
  readIsAnchored,
  readIsBatchAnchored,
} from "../lib/chain.js";
import {
  merkleProofsForLeaves,
  type MerkleProofStep,
  verifyMerkleProof,
} from "../lib/merkle.js";
import {
  authMiddleware,
  requireRoles,
  type AuthedRequest,
} from "../middleware/authMiddleware.js";
import { signFirReceipt } from "../lib/receipt.js";

const createFirSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(8000),
  locationText: z.string().max(500).optional(),
  incidentAt: z.string().datetime().optional(),
});

const batchCreateSchema = z.object({
  items: z.array(createFirSchema).min(1).max(64),
});

function parseCanonicalFirPayload(canonicalPayloadJson: string): FirPayload {
  return JSON.parse(canonicalPayloadJson) as FirPayload;
}

function parseMerkleProof(value: Prisma.JsonValue | null): MerkleProofStep[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return value as MerkleProofStep[];
}

type IntegritySignals = {
  /** Editable columns still match the frozen JSON blob that was hashed. */
  rowMatchesCanonicalPayload: boolean;
  /** Frozen JSON still hashes to stored contentHash (internal DB corruption if false). */
  canonicalBlobMatchesStoredHash: boolean;
};

function integritySignalsForFir(fir: Fir): IntegritySignals {
  const storedPayload = parseCanonicalFirPayload(fir.canonicalPayloadJson);
  const canonicalBlobMatchesStoredHash =
    firContentHash(storedPayload) === fir.contentHash;
  const rowPayload = firPayloadFromRow(fir);
  const rowMatchesCanonicalPayload =
    canonicalizePayload(rowPayload) === fir.canonicalPayloadJson;
  return { rowMatchesCanonicalPayload, canonicalBlobMatchesStoredHash };
}

function effectiveIntegrity(fir: Fir, signals: IntegritySignals): string {
  if (!signals.rowMatchesCanonicalPayload || !signals.canonicalBlobMatchesStoredHash) {
    return "TAMPERED";
  }
  if (fir.integrityStatus === "TAMPERED") return "TAMPERED";
  if (fir.integrityStatus === "PENDING" && fir.chainBlockNumber == null) return "PENDING";
  return "OK";
}

function attachFirView<T extends Fir>(fir: T) {
  const integritySignals = integritySignalsForFir(fir);
  return {
    ...fir,
    integritySignals,
    effectiveIntegrity: effectiveIntegrity(fir, integritySignals),
  };
}

export function createFirsRouter(env: Env) {
  const r = Router();
  const requireAuth = authMiddleware(env);

  r.post("/", requireAuth, requireRoles(Role.CITIZEN), async (req: AuthedRequest, res) => {
    const parsed = createFirSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const userId = req.user!.id;

    const externalReference = randomUUID();
    const payload: FirPayload = {
      externalReference,
      title: parsed.data.title,
      description: parsed.data.description,
      locationText: parsed.data.locationText ?? null,
      incidentAt: parsed.data.incidentAt ?? null,
    };
    const contentHash = firContentHash(payload);
    const canonicalPayloadJson = canonicalizePayload(payload);
    const registeredAt = new Date();
    const firReceipt = await signFirReceipt(env.SIGNER_PRIVATE_KEY as `0x${string}`, {
      externalReference,
      contentHash,
      registeredAt: registeredAt.toISOString(),
    });

    let chainTxHash: string | null = null;
    let chainBlockNumber: number | null = null;
    let anchoredAt: Date | null = null;
    let integrityStatus = "PENDING";

    if (env.ANCHOR_MODE === "single") {
      const { contract } = getChainClients({
        rpcUrl: env.RPC_URL,
        signerKey: env.SIGNER_PRIVATE_KEY as `0x${string}`,
        contractAddress: env.FIR_CONTRACT_ADDRESS as `0x${string}`,
      });
      try {
        const chainReceipt = await anchorOnChain(contract, contentHash, externalReference);
        chainTxHash = chainReceipt.txHash;
        chainBlockNumber = chainReceipt.blockNumber;
        anchoredAt = new Date();
        integrityStatus = "OK";
      } catch (e) {
        console.error("Chain anchor failed", e);
        return res.status(502).json({ error: "Blockchain anchor failed; FIR not stored" });
      }
    }

    const fir = await prisma.fir.create({
      data: {
        externalReference,
        title: payload.title,
        description: payload.description,
        locationText: payload.locationText,
        incidentAt: payload.incidentAt ? new Date(payload.incidentAt) : null,
        canonicalPayloadJson,
        contentHash,
        receiptSignature: firReceipt.signature,
        chainTxHash,
        chainBlockNumber,
        anchoredAt,
        integrityStatus,
        createdById: userId,
        createdAt: registeredAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: env.ANCHOR_MODE === "single" ? "FIR_CREATED_ANCHORED" : "FIR_CREATED_PENDING",
        firId: fir.id,
        actorId: userId,
        details: {
          externalReference,
          contentHash,
          chainTxHash,
          anchorMode: env.ANCHOR_MODE,
          receiptSignature: firReceipt.signature,
        },
      },
    });

    res.status(201).json({
      id: fir.id,
      externalReference: fir.externalReference,
      contentHash: fir.contentHash,
      chainTxHash: fir.chainTxHash,
      chainBlockNumber: fir.chainBlockNumber,
      status: integrityStatus,
      receipt: firReceipt,
    });
  });

  /**
   * Thesis-II: create N FIRs under one Merkle root and one anchorBatch tx.
   * Officer/admin only (batch operator path); citizen single-create remains Phase I.
   */
  r.post(
    "/batch",
    requireAuth,
    requireRoles(Role.OFFICER, Role.ADMIN),
    async (req: AuthedRequest, res) => {
      const parsed = batchCreateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const userId = req.user!.id;
      const batchId = randomUUID();

      const prepared = parsed.data.items.map((item) => {
        const externalReference = randomUUID();
        const payload: FirPayload = {
          externalReference,
          title: item.title,
          description: item.description,
          locationText: item.locationText ?? null,
          incidentAt: item.incidentAt ?? null,
        };
        const contentHash = firContentHash(payload);
        const canonicalPayloadJson = canonicalizePayload(payload);
        return { payload, contentHash, canonicalPayloadJson, externalReference };
      });

      const leafHashes = prepared.map((p) => p.contentHash);
      const { root, items: proofs } = merkleProofsForLeaves(leafHashes);

      const { contract } = getChainClients({
        rpcUrl: env.RPC_URL,
        signerKey: env.SIGNER_PRIVATE_KEY as `0x${string}`,
        contractAddress: env.FIR_CONTRACT_ADDRESS as `0x${string}`,
      });

      let chainTxHash: string;
      let chainBlockNumber: number;
      try {
        const receipt = await anchorBatchOnChain(contract, root, batchId);
        chainTxHash = receipt.txHash;
        chainBlockNumber = receipt.blockNumber;
      } catch (e) {
        console.error("Batch chain anchor failed", e);
        return res.status(502).json({ error: "Blockchain batch anchor failed; FIRs not stored" });
      }

      const anchoredAt = new Date();
      const created = [];
      for (let i = 0; i < prepared.length; i++) {
        const p = prepared[i]!;
        const proof = proofs[i]!;
        const fir = await prisma.fir.create({
          data: {
            externalReference: p.externalReference,
            title: p.payload.title,
            description: p.payload.description,
            locationText: p.payload.locationText,
            incidentAt: p.payload.incidentAt ? new Date(p.payload.incidentAt) : null,
            canonicalPayloadJson: p.canonicalPayloadJson,
            contentHash: p.contentHash,
            chainTxHash,
            chainBlockNumber,
            anchoredAt,
            merkleRoot: root,
            merkleProof: proof.proof as unknown as Prisma.InputJsonValue,
            batchId,
            integrityStatus: "OK",
            createdById: userId,
          },
        });
        created.push({
          id: fir.id,
          externalReference: fir.externalReference,
          contentHash: fir.contentHash,
          merkleRoot: fir.merkleRoot,
          proofLength: proof.proof.length,
        });
      }

      await prisma.auditLog.create({
        data: {
          action: "FIR_BATCH_ANCHORED",
          actorId: userId,
          details: {
            batchId,
            merkleRoot: root,
            chainTxHash,
            count: created.length,
            firIds: created.map((c) => c.id),
          },
        },
      });

      res.status(201).json({
        batchId,
        merkleRoot: root,
        chainTxHash,
        chainBlockNumber,
        items: created,
      });
    },
  );

  r.get("/", requireAuth, requireRoles(Role.OFFICER, Role.ADMIN), async (_req, res) => {
    const rows = await prisma.fir.findMany({
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { email: true, id: true } } },
    });
    const items = rows.map((row) => attachFirView(row));
    res.json({ items });
  });

  /** Block-by-block view of the chain with each anchor resolved to its FIR(s). */
  r.get("/chain", requireAuth, requireRoles(Role.OFFICER, Role.ADMIN), async (_req, res) => {
    const { contract, provider } = getChainClients({
      rpcUrl: env.RPC_URL,
      signerKey: env.SIGNER_PRIVATE_KEY as `0x${string}`,
      contractAddress: env.FIR_CONTRACT_ADDRESS as `0x${string}`,
    });

    let overview: Awaited<ReturnType<typeof readChainOverview>>;
    try {
      overview = await readChainOverview(provider, contract, 200);
    } catch (e) {
      console.error("Chain overview failed", e);
      return res.status(502).json({ error: "Blockchain node unreachable or contract address invalid" });
    }

    const firs = await prisma.fir.findMany();
    const byRef = new Map(firs.map((f) => [f.externalReference, f]));
    const byBatch = new Map<string, Fir[]>();
    for (const f of firs) {
      if (!f.batchId) continue;
      byBatch.set(f.batchId, [...(byBatch.get(f.batchId) ?? []), f]);
    }

    const firNode = (fir: Fir, onChainHash: string, kind: "single" | "batch") => {
      const signals = integritySignalsForFir(fir);
      const dbConsistent = signals.rowMatchesCanonicalPayload && signals.canonicalBlobMatchesStoredHash;
      const proof = parseMerkleProof(fir.merkleProof);
      const linksToChain =
        kind === "single"
          ? fir.contentHash.toLowerCase() === onChainHash
          : Boolean(proof && verifyMerkleProof(fir.contentHash as `0x${string}`, proof, onChainHash as `0x${string}`));
      let title = fir.title;
      try {
        title = parseCanonicalFirPayload(fir.canonicalPayloadJson).title;
      } catch {
        /* fall back to column */
      }
      return {
        id: fir.id,
        title,
        externalReference: fir.externalReference,
        contentHash: fir.contentHash,
        matchesChain: dbConsistent && linksToChain,
      };
    };

    const eventByTx = new Map(overview.events.map((e) => [e.txHash, e]));
    const contractAddress = env.FIR_CONTRACT_ADDRESS.toLowerCase();

    const blocks = overview.blocks.map((b) => ({
      number: b.number,
      hash: b.hash,
      parentHash: b.parentHash,
      timestamp: b.timestamp,
      transactions: b.transactions.map((t) => {
        const ev = eventByTx.get(t.hash);
        if (ev?.kind === "single") {
          const fir = byRef.get(ev.ref);
          return {
            hash: t.hash,
            kind: "anchor" as const,
            anchoredHash: ev.hash,
            ref: ev.ref,
            firs: fir ? [firNode(fir, ev.hash, "single")] : [],
          };
        }
        if (ev?.kind === "batch") {
          return {
            hash: t.hash,
            kind: "batch" as const,
            anchoredHash: ev.hash,
            ref: ev.ref,
            firs: (byBatch.get(ev.ref) ?? []).map((f) => firNode(f, ev.hash, "batch")),
          };
        }
        const kind = t.to === null ? ("deploy" as const) : ("other" as const);
        return { hash: t.hash, kind, anchoredHash: null, ref: null, firs: [] };
      }),
    }));

    res.json({
      chainId: overview.chainId,
      contractAddress,
      latestBlock: overview.latestBlock,
      totalAnchors: overview.events.length,
      blocks,
    });
  });

  /** Citizen self-service: only FIRs the caller submitted are visible. */
  r.get("/mine", requireAuth, requireRoles(Role.CITIZEN), async (req: AuthedRequest, res) => {
    const rows = await prisma.fir.findMany({
      where: { createdById: req.user!.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ items: rows.map((row) => attachFirView(row)) });
  });

  r.get("/mine/:id", requireAuth, requireRoles(Role.CITIZEN), async (req: AuthedRequest, res) => {
    const fir = await prisma.fir.findFirst({
      where: { id: String(req.params.id), createdById: req.user!.id },
    });
    if (!fir) return res.status(404).json({ error: "Not found" });
    res.json(attachFirView(fir));
  });

  r.post("/mine/:id/verify", requireAuth, requireRoles(Role.CITIZEN), async (req: AuthedRequest, res) => {
    const fir = await prisma.fir.findFirst({
      where: { id: String(req.params.id), createdById: req.user!.id },
    });
    if (!fir) return res.status(404).json({ error: "Not found" });
    try {
      res.json(await verifyFirRecord(fir, req.user!.id));
    } catch (e) {
      console.error("Citizen verify failed", e);
      res.status(502).json({ error: "Verification failed: blockchain node unreachable" });
    }
  });

  r.get("/:id", requireAuth, requireRoles(Role.OFFICER, Role.ADMIN), async (req, res) => {
    const fir = await prisma.fir.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!fir) return res.status(404).json({ error: "Not found" });
    res.json(attachFirView(fir));
  });

  r.post("/:id/verify", requireAuth, requireRoles(Role.OFFICER, Role.ADMIN), async (req: AuthedRequest, res) => {
    const fir = await prisma.fir.findUnique({
      where: { id: String(req.params.id) },
    });
    if (!fir) return res.status(404).json({ error: "Not found" });
    try {
      res.json(await verifyFirRecord(fir, req.user!.id));
    } catch (e) {
      console.error("Verify failed", e);
      res.status(502).json({ error: "Verification failed: blockchain node unreachable" });
    }
  });

  async function verifyFirRecord(fir: Fir, actorId: string) {
    const stored = parseCanonicalFirPayload(fir.canonicalPayloadJson);
    const recomputed = firContentHash(stored);
    const canonicalBlobMatchesStoredHash = recomputed === fir.contentHash;

    const rowPayload = firPayloadFromRow(fir);
    const rowMatchesCanonicalPayload =
      canonicalizePayload(rowPayload) === fir.canonicalPayloadJson;
    const recomputedRowHash = firContentHash(rowPayload);

    const proof = parseMerkleProof(fir.merkleProof);
    const isBatch = Boolean(fir.merkleRoot && proof);
    const isPending = fir.integrityStatus === "PENDING" && fir.chainBlockNumber == null;

    let merkleProofValid: boolean | null = null;
    let batchAnchoredOnChain: boolean | null = null;
    let singleAnchoredOnChain: boolean | null = null;
    let anchoredOnChain = false;

    if (isPending) {
      // Still waiting for the batch worker — do not mark TAMPERED solely for missing chain.
      const integrityStatus =
        canonicalBlobMatchesStoredHash && rowMatchesCanonicalPayload ? "PENDING" : "TAMPERED";
      if (integrityStatus === "TAMPERED") {
        await prisma.fir.update({
          where: { id: String(fir.id) },
          data: { integrityStatus },
        });
      }
      await prisma.auditLog.create({
        data: {
          action: "FIR_VERIFY",
          firId: fir.id,
          actorId,
          details: {
            canonicalBlobMatchesStoredHash,
            rowMatchesCanonicalPayload,
            onChain: false,
            pending: true,
            recomputed,
            recomputedRowHash,
            storedHash: fir.contentHash,
          },
        },
      });
      return {
        integrityStatus,
        dbMatchesCanonical: canonicalBlobMatchesStoredHash,
        rowMatchesCanonicalPayload,
        anchoredOnChain: false,
        verificationMode: "pending" as const,
        merkleProofValid: null,
        batchAnchoredOnChain: null,
        singleAnchoredOnChain: null,
        merkleRoot: fir.merkleRoot,
        batchId: fir.batchId,
        proofLength: proof?.length ?? null,
        leafHash: recomputed,
        storedContentHash: fir.contentHash,
        recomputedContentHash: recomputed,
        recomputedFromRowHash: recomputedRowHash,
      };
    }

    const { contract } = getChainClients({
      rpcUrl: env.RPC_URL,
      signerKey: env.SIGNER_PRIVATE_KEY as `0x${string}`,
      contractAddress: env.FIR_CONTRACT_ADDRESS as `0x${string}`,
    });

    if (isBatch && fir.merkleRoot && proof) {
      merkleProofValid = verifyMerkleProof(recomputed, proof, fir.merkleRoot);
      batchAnchoredOnChain = await readIsBatchAnchored(
        contract,
        fir.merkleRoot as `0x${string}`,
      );
      anchoredOnChain = Boolean(merkleProofValid && batchAnchoredOnChain);
    } else {
      singleAnchoredOnChain = await readIsAnchored(contract, fir.contentHash as `0x${string}`);
      anchoredOnChain = singleAnchoredOnChain;
    }

    const integrityStatus =
      canonicalBlobMatchesStoredHash && rowMatchesCanonicalPayload && anchoredOnChain
        ? "OK"
        : "TAMPERED";
    await prisma.fir.update({
      where: { id: String(fir.id) },
      data: { integrityStatus },
    });
    await prisma.auditLog.create({
      data: {
        action: "FIR_VERIFY",
        firId: fir.id,
        actorId,
        details: {
          canonicalBlobMatchesStoredHash,
          rowMatchesCanonicalPayload,
          onChain: anchoredOnChain,
          merkleProofValid,
          batchAnchoredOnChain,
          singleAnchoredOnChain,
          recomputed,
          recomputedRowHash,
          storedHash: fir.contentHash,
          merkleRoot: fir.merkleRoot,
          batchId: fir.batchId,
        },
      },
    });

    return {
      integrityStatus,
      dbMatchesCanonical: canonicalBlobMatchesStoredHash,
      rowMatchesCanonicalPayload,
      anchoredOnChain,
      verificationMode: isBatch ? ("merkle_batch" as const) : ("single_hash" as const),
      merkleProofValid,
      batchAnchoredOnChain,
      singleAnchoredOnChain,
      merkleRoot: fir.merkleRoot,
      batchId: fir.batchId,
      proofLength: proof?.length ?? null,
      leafHash: recomputed,
      storedContentHash: fir.contentHash,
      recomputedContentHash: recomputed,
      recomputedFromRowHash: recomputedRowHash,
    };
  }

  return r;
}
