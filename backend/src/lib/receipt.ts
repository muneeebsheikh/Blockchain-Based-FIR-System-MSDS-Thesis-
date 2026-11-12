import { Wallet, verifyMessage } from "ethers";

export type FirReceipt = {
  version: "v1";
  externalReference: string;
  contentHash: string;
  registeredAt: string;
  signature: string;
};

/** Canonical message that is EIP-191 signed for a citizen FIR receipt. */
export function receiptMessage(parts: {
  externalReference: string;
  contentHash: string;
  registeredAt: string;
}): string {
  return `FIR-RECEIPT|v1|${parts.externalReference}|${parts.contentHash}|${parts.registeredAt}`;
}

export async function signFirReceipt(
  signerKey: `0x${string}`,
  parts: { externalReference: string; contentHash: string; registeredAt: string },
): Promise<FirReceipt> {
  const wallet = new Wallet(signerKey);
  const message = receiptMessage(parts);
  const signature = await wallet.signMessage(message);
  return {
    version: "v1",
    externalReference: parts.externalReference,
    contentHash: parts.contentHash,
    registeredAt: parts.registeredAt,
    signature,
  };
}

export function verifyFirReceiptSignature(
  receipt: FirReceipt,
  expectedSignerAddress?: string,
): { signatureValid: boolean; recoveredAddress: string | null; signerMatches: boolean | null } {
  try {
    const message = receiptMessage({
      externalReference: receipt.externalReference,
      contentHash: receipt.contentHash,
      registeredAt: receipt.registeredAt,
    });
    const recoveredAddress = verifyMessage(message, receipt.signature);
    const signerMatches =
      expectedSignerAddress != null
        ? recoveredAddress.toLowerCase() === expectedSignerAddress.toLowerCase()
        : null;
    // ECDSA recovery always yields *some* address; validity means the message was signed by the expected key.
    const signatureValid = expectedSignerAddress != null ? Boolean(signerMatches) : true;
    return { signatureValid, recoveredAddress, signerMatches };
  } catch {
    return { signatureValid: false, recoveredAddress: null, signerMatches: false };
  }
}

export function signerAddressFromKey(signerKey: `0x${string}`): string {
  return new Wallet(signerKey).address;
}
