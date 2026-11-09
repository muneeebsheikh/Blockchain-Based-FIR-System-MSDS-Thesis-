import crypto from "node:crypto";

export type Hex32 = `0x${string}`;

export type MerkleProofStep = {
  sibling: Hex32;
  /** True if sibling is placed on the left when hashing (sibling < current). */
  siblingOnLeft: boolean;
};

export type MerkleLeafResult = {
  leaf: Hex32;
  proof: MerkleProofStep[];
  root: Hex32;
  index: number;
};

function normalizeHex32(h: string): Hex32 {
  const s = h.startsWith("0x") || h.startsWith("0X") ? h.slice(2) : h;
  if (!/^[0-9a-fA-F]{64}$/.test(s)) {
    throw new Error(`Expected 32-byte hex hash, got: ${h}`);
  }
  return `0x${s.toLowerCase()}` as Hex32;
}

function toBuf(h: Hex32): Buffer {
  return Buffer.from(h.slice(2), "hex");
}

/** Lexicographically smaller 32-byte value first, then SHA-256. */
export function hashPair(a: Hex32, b: Hex32): Hex32 {
  const A = toBuf(normalizeHex32(a));
  const B = toBuf(normalizeHex32(b));
  const [left, right] = Buffer.compare(A, B) <= 0 ? [A, B] : [B, A];
  const digest = crypto.createHash("sha256").update(left).update(right).digest();
  return `0x${digest.toString("hex")}` as Hex32;
}

/**
 * Build a Merkle tree over leaf hashes (order preserved for proof indices).
 * Odd node at a level is promoted unchanged.
 */
export function buildMerkleTree(leavesIn: string[]): {
  root: Hex32;
  leaves: Hex32[];
  layers: Hex32[][];
} {
  if (leavesIn.length === 0) throw new Error("Merkle tree requires at least one leaf");
  const leaves = leavesIn.map(normalizeHex32);
  const layers: Hex32[][] = [leaves];
  let level = leaves;
  while (level.length > 1) {
    const next: Hex32[] = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) {
        next.push(level[i]!);
      } else {
        next.push(hashPair(level[i]!, level[i + 1]!));
      }
    }
    layers.push(next);
    level = next;
  }
  return { root: level[0]!, leaves, layers };
}

export function getMerkleProof(leavesIn: string[], leafIndex: number): MerkleLeafResult {
  const { root, leaves, layers } = buildMerkleTree(leavesIn);
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error(`leafIndex ${leafIndex} out of range`);
  }
  const proof: MerkleProofStep[] = [];
  let idx = leafIndex;
  for (let li = 0; li < layers.length - 1; li++) {
    const layer = layers[li]!;
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    if (siblingIdx < layer.length) {
      const current = layer[idx]!;
      const sibling = layer[siblingIdx]!;
      const siblingOnLeft = Buffer.compare(toBuf(sibling), toBuf(current)) < 0;
      proof.push({ sibling, siblingOnLeft });
    }
    idx = Math.floor(idx / 2);
  }
  return { leaf: leaves[leafIndex]!, proof, root, index: leafIndex };
}

export function verifyMerkleProof(leaf: string, proof: MerkleProofStep[], expectedRoot: string): boolean {
  let node = normalizeHex32(leaf);
  const root = normalizeHex32(expectedRoot);
  for (const step of proof) {
    const sib = normalizeHex32(step.sibling);
    node = hashPair(node, sib);
  }
  return node === root;
}

/** Convenience: proofs for every leaf under one root. */
export function merkleProofsForLeaves(leavesIn: string[]): {
  root: Hex32;
  items: MerkleLeafResult[];
} {
  const { root, leaves } = buildMerkleTree(leavesIn);
  const items = leaves.map((_, i) => getMerkleProof(leaves, i));
  return { root, items };
}
