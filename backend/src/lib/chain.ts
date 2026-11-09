import { Contract, JsonRpcProvider, Wallet, type EventLog, type Log } from "ethers";

const FIR_ANCHOR_ABI = [
  "function anchor(bytes32 contentHash, string externalId)",
  "function isAnchored(bytes32 contentHash) view returns (bool)",
  "function anchorBatch(bytes32 merkleRoot, string batchId)",
  "function isBatchAnchored(bytes32 merkleRoot) view returns (bool)",
  "event FIRAnchored(bytes32 indexed contentHash, address indexed submitter, uint256 timestamp, string externalId)",
  "event FIRBatchAnchored(bytes32 indexed merkleRoot, address indexed submitter, uint256 timestamp, string batchId)",
] as const;

export type ChainClients = {
  contract: Contract;
  provider: JsonRpcProvider;
  signerAddress: string;
};

export function getChainClients(opts: {
  rpcUrl: string;
  signerKey: `0x${string}`;
  contractAddress: `0x${string}`;
}): ChainClients {
  const provider = new JsonRpcProvider(opts.rpcUrl);
  const wallet = new Wallet(opts.signerKey, provider);
  const contract = new Contract(opts.contractAddress, FIR_ANCHOR_ABI, wallet);
  return { contract, provider, signerAddress: wallet.address };
}

export type ChainAnchorEvent = {
  kind: "single" | "batch";
  /** contentHash for single anchors, Merkle root for batches. */
  hash: string;
  /** externalId (FIR reference) for single anchors, batchId for batches. */
  ref: string;
  submitter: string;
  timestamp: number;
  txHash: string;
  blockNumber: number;
};

export type ChainTx = {
  hash: string;
  from: string;
  to: string | null;
};

export type ChainBlock = {
  number: number;
  hash: string;
  parentHash: string;
  timestamp: number;
  transactions: ChainTx[];
};

/** Reads the most recent `maxBlocks` blocks plus every FIRAnchor event from the node. */
export async function readChainOverview(
  provider: JsonRpcProvider,
  contract: Contract,
  maxBlocks: number,
): Promise<{ chainId: number; latestBlock: number; blocks: ChainBlock[]; events: ChainAnchorEvent[] }> {
  const [network, latestBlock] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);
  const from = Math.max(0, latestBlock - maxBlocks + 1);
  const numbers = Array.from({ length: latestBlock - from + 1 }, (_, i) => from + i);

  const blocks = await Promise.all(
    numbers.map(async (n): Promise<ChainBlock | null> => {
      const b = await provider.getBlock(n, true);
      if (!b || !b.hash) return null;
      return {
        number: b.number,
        hash: b.hash,
        parentHash: b.parentHash,
        timestamp: b.timestamp,
        transactions: b.prefetchedTransactions.map((t) => ({ hash: t.hash, from: t.from, to: t.to })),
      };
    }),
  );

  const toEvent =
    (kind: ChainAnchorEvent["kind"]) =>
    (e: EventLog | Log): ChainAnchorEvent | null => {
      if (!("args" in e)) return null;
      return {
        kind,
        hash: String(e.args[0]).toLowerCase(),
        submitter: String(e.args[1]),
        timestamp: Number(e.args[2]),
        ref: String(e.args[3]),
        txHash: e.transactionHash,
        blockNumber: e.blockNumber,
      };
    };

  const [singles, batches] = await Promise.all([
    contract.queryFilter(contract.filters.FIRAnchored(), 0, "latest"),
    contract.queryFilter(contract.filters.FIRBatchAnchored(), 0, "latest"),
  ]);
  const events = [...singles.map(toEvent("single")), ...batches.map(toEvent("batch"))].filter(
    (e): e is ChainAnchorEvent => e !== null,
  );

  return {
    chainId: Number(network.chainId),
    latestBlock,
    blocks: blocks.filter((b): b is ChainBlock => b !== null),
    events,
  };
}

export async function anchorOnChain(
  contract: Contract,
  contentHash: `0x${string}`,
  externalId: string,
): Promise<{ txHash: string; blockNumber: number }> {
  const tx = await contract.anchor(contentHash, externalId);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Missing transaction receipt");
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

export async function readIsAnchored(contract: Contract, contentHash: `0x${string}`): Promise<boolean> {
  return Boolean(await contract.isAnchored(contentHash));
}

export async function anchorBatchOnChain(
  contract: Contract,
  merkleRoot: `0x${string}`,
  batchId: string,
): Promise<{ txHash: string; blockNumber: number }> {
  const tx = await contract.anchorBatch(merkleRoot, batchId);
  const receipt = await tx.wait();
  if (!receipt) throw new Error("Missing transaction receipt");
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}

export async function readIsBatchAnchored(
  contract: Contract,
  merkleRoot: `0x${string}`,
): Promise<boolean> {
  return Boolean(await contract.isBatchAnchored(merkleRoot));
}
