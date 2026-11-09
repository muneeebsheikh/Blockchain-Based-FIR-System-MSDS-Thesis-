/**
 * Lightweight self-test for Merkle helper (run via: npx tsx src/lib/merkle.selftest.ts).
 */
import assert from "node:assert/strict";
import {
  buildMerkleTree,
  getMerkleProof,
  hashPair,
  merkleProofsForLeaves,
  verifyMerkleProof,
} from "./merkle.js";

const a = ("0x" + "11".repeat(32)) as `0x${string}`;
const b = ("0x" + "22".repeat(32)) as `0x${string}`;
const c = ("0x" + "33".repeat(32)) as `0x${string}`;

{
  const root = hashPair(a, b);
  assert.equal(verifyMerkleProof(a, [{ sibling: b, siblingOnLeft: false }], root), true);
}

{
  const { root, items } = merkleProofsForLeaves([a, b, c]);
  for (const item of items) {
    assert.equal(item.root, root);
    assert.equal(verifyMerkleProof(item.leaf, item.proof, root), true);
  }
  const bad = ("0x" + "44".repeat(32)) as `0x${string}`;
  assert.equal(verifyMerkleProof(bad, items[0]!.proof, root), false);
}

{
  const { root } = buildMerkleTree([a]);
  assert.equal(root, a);
  const p = getMerkleProof([a], 0);
  assert.equal(p.proof.length, 0);
  assert.equal(verifyMerkleProof(a, [], root), true);
}

console.log("merkle.selftest: ok");
