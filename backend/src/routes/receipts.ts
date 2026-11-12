import { Router } from "express";
import { z } from "zod";
import type { Env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import {
  signerAddressFromKey,
  verifyFirReceiptSignature,
  type FirReceipt,
} from "../lib/receipt.js";

const receiptSchema = z.object({
  version: z.literal("v1"),
  externalReference: z.string().min(1),
  contentHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  registeredAt: z.string().min(1),
  signature: z.string().min(1),
});

/** Public receipt verification — no auth; anyone with the receipt JSON can check it. */
export function createReceiptsRouter(env: Env) {
  const r = Router();
  const systemSigner = signerAddressFromKey(env.SIGNER_PRIVATE_KEY as `0x${string}`);

  r.post("/verify", async (req, res) => {
    const parsed = receiptSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const receipt = parsed.data as FirReceipt;

    const sig = verifyFirReceiptSignature(receipt, systemSigner);
    const fir = await prisma.fir.findUnique({
      where: { externalReference: receipt.externalReference },
    });

    const firFound = Boolean(fir);
    const hashMatchesCurrentRecord = fir ? fir.contentHash.toLowerCase() === receipt.contentHash.toLowerCase() : null;
    const anchored = fir ? fir.chainBlockNumber != null && fir.integrityStatus !== "PENDING" : null;
    const anchoredHashMatchesReceipt =
      fir && fir.chainBlockNumber != null
        ? fir.contentHash.toLowerCase() === receipt.contentHash.toLowerCase()
        : null;

    res.json({
      signatureValid: sig.signatureValid,
      recoveredAddress: sig.recoveredAddress,
      signerMatchesSystem: sig.signerMatches,
      systemSignerAddress: systemSigner,
      firFound,
      hashMatchesCurrentRecord,
      anchored,
      anchoredHashMatchesReceipt,
      fir: fir
        ? {
            id: fir.id,
            title: fir.title,
            integrityStatus: fir.integrityStatus,
            chainBlockNumber: fir.chainBlockNumber,
            merkleRoot: fir.merkleRoot,
            batchId: fir.batchId,
          }
        : null,
    });
  });

  return r;
}
