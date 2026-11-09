import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const factory = await ethers.getContractFactory("FIRAnchor");
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const receipt = deployTx ? await deployTx.wait() : null;

  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", "FIRAnchor.sol", "FIRAnchor.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as { abi: unknown };

  const record = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    contractName: "FIRAnchor",
    address,
    abi: artifact.abi,
    deploymentTxHash: deployTx?.hash ?? receipt?.hash ?? null,
    blockNumber: receipt?.blockNumber ?? null,
    deployedAt: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments", network.name);
  fs.mkdirSync(outDir, { recursive: true });
  const outfile = path.join(outDir, "FIRAnchor.json");
  fs.writeFileSync(outfile, JSON.stringify(record, null, 2), "utf8");
  // eslint-disable-next-line no-console -- deploy script
  console.log("FIRAnchor deployed to", address);
  // eslint-disable-next-line no-console -- deploy script
  console.log("Wrote", outfile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
