import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Env } from "../env.js";
import { prisma } from "./prisma.js";
import { firContentHash, type FirPayload } from "./hashCanonical.js";
import { merkleProofsForLeaves } from "./merkle.js";
import { anchorBatchOnChain, getChainClients } from "./chain.js";

const TICK_MS = 5_000;

type ClaimedRow = {
  id: string;
  contentHash: string;
  canonicalPayloadJson: string;
  createdAt: Date;
};

/**
 * Background worker: claims PENDING FIRs and anchors them under one Merkle root.
 * Flush when oldest pending FIR is >= BATCH_INTERVAL_SECONDS old, or pending count >= BATCH_MAX_SIZE.
 */
export function startBatchWorker(env: Env): () => void {
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (stopped || running || env.ANCHOR_MODE !== "batch") return;
    running = true;
    try {
      await flushIfNeeded(env);
    } catch (e) {
      console.error("[batchWorker] tick failed", e);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), TICK_MS);
  void tick();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

async function flushIfNeeded(env: Env): Promise<void> {
  const pending = await prisma.fir.findMany({
    where: { integrityStatus: "PENDING", batchId: null, chainBlockNumber: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true },
    take: env.BATCH_MAX_SIZE,
  });
  if (pending.length === 0) return;

  const oldestAgeSec = (Date.now() - pending[0]!.createdAt.getTime()) / 1000;
  const full = pending.length >= env.BATCH_MAX_SIZE;
  const due = oldestAgeSec >= env.BATCH_INTERVAL_SECONDS;
  if (!full && !due) return;

  await processBatch(env);
}

async function processBatch(env: Env): Promise<void> {
  const batchId = randomUUID();

  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<ClaimedRow[]>`
      UPDATE "Fir"
      SET "batchId" = ${batchId}
      WHERE id IN (
        SELECT id FROM "Fir"
        WHERE "integrityStatus" = 'PENDING'
          AND "batchId" IS NULL
          AND "chainBlockNumber" IS NULL
        ORDER BY "createdAt" ASC
        LIMIT ${env.BATCH_MAX_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "contentHash", "canonicalPayloadJson", "createdAt"
    `;
    return rows;
  });

  if (claimed.length === 0) return;

  const valid: ClaimedRow[] = [];
  for (const row of claimed) {
    try {
      const payload = JSON.parse(row.canonicalPayloadJson) as FirPayload;
      if (firContentHash(payload) !== row.contentHash) {
        console.warn(`[batchWorker] skipping corrupted FIR ${row.id}: hash mismatch`);
        await prisma.fir.update({
          where: { id: row.id },
          data: { batchId: null, integrityStatus: "TAMPERED" },
        });
        continue;
      }
      valid.push(row);
    } catch (e) {
      console.warn(`[batchWorker] skipping unreadable FIR ${row.id}`, e);
      await prisma.fir.update({
        where: { id: row.id },
        data: { batchId: null, integrityStatus: "TAMPERED" },
      });
    }
  }

  if (valid.length === 0) return;

  const leafHashes = valid.map((r) => r.contentHash);
  const { root, items: proofs } = merkleProofsForLeaves(leafHashes);

  try {
    const { contract } = getChainClients({
      rpcUrl: env.RPC_URL,
      signerKey: env.SIGNER_PRIVATE_KEY as `0x${string}`,
      contractAddress: env.FIR_CONTRACT_ADDRESS as `0x${string}`,
    });
    const chainReceipt = await anchorBatchOnChain(contract, root, batchId);
    const anchoredAt = new Date();

    for (let i = 0; i < valid.length; i++) {
      const row = valid[i]!;
      const proof = proofs[i]!;
      await prisma.fir.update({
        where: { id: row.id },
        data: {
          merkleRoot: root,
          merkleProof: proof.proof as unknown as Prisma.InputJsonValue,
          batchId,
          chainTxHash: chainReceipt.txHash,
          chainBlockNumber: chainReceipt.blockNumber,
          anchoredAt,
          integrityStatus: "OK",
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        action: "FIR_BATCH_ANCHORED",
        details: {
          source: "worker",
          batchId,
          merkleRoot: root,
          chainTxHash: chainReceipt.txHash,
          chainBlockNumber: chainReceipt.blockNumber,
          count: valid.length,
          firIds: valid.map((v) => v.id),
        },
      },
    });

    console.log(
      `[batchWorker] anchored ${valid.length} FIR(s) batch=${batchId} root=${root} block=${chainReceipt.blockNumber}`,
    );
  } catch (e) {
    console.error("[batchWorker] chain anchor failed; releasing claims for retry", e);
    await prisma.fir.updateMany({
      where: { batchId, integrityStatus: "PENDING" },
      data: { batchId: null },
    });
  }
}
