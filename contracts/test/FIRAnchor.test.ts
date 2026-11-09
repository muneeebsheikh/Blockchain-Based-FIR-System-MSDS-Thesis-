import { expect } from "chai";
import { ethers } from "hardhat";

describe("FIRAnchor", () => {
  it("anchors a hash once", async () => {
    const C = await ethers.getContractFactory("FIRAnchor");
    const c = await C.deploy();
    const h = ethers.keccak256(ethers.toUtf8Bytes("demo-fir-payload"));
    await expect(c.anchor(h, "ext-1")).to.emit(c, "FIRAnchored");
    expect(await c.isAnchored(h)).to.equal(true);
    await expect(c.anchor(h, "ext-2")).to.be.revertedWithCustomError(c, "AlreadyAnchored");
  });

  it("anchors a Merkle batch root once", async () => {
    const C = await ethers.getContractFactory("FIRAnchor");
    const c = await C.deploy();
    const root = ethers.keccak256(ethers.toUtf8Bytes("batch-root-demo"));
    await expect(c.anchorBatch(root, "batch-1")).to.emit(c, "FIRBatchAnchored");
    expect(await c.isBatchAnchored(root)).to.equal(true);
    await expect(c.anchorBatch(root, "batch-2")).to.be.revertedWithCustomError(
      c,
      "AlreadyBatchAnchored",
    );
  });
});
