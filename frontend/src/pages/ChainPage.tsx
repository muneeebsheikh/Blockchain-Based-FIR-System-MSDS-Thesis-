import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  getChain,
  type ChainBlockView,
  type ChainFirNode,
  type ChainOverview,
  type ChainTxView,
} from "../api/client";

const REFRESH_MS = 5000;
const FIRS_PER_NODE = 3;

type BlockKind = "genesis" | "deploy" | "anchor" | "batch" | "other";

const KIND_LABEL: Record<BlockKind, string> = {
  genesis: "Genesis",
  deploy: "Contract deploy",
  anchor: "FIR anchor",
  batch: "Merkle batch",
  other: "Transaction",
};

function short(hash: string | null | undefined, head = 6, tail = 4) {
  if (!hash) return "n/a";
  return hash.length <= head + tail + 2 ? hash : `${hash.slice(0, head + 2)}…${hash.slice(-tail)}`;
}

function blockKind(b: ChainBlockView): BlockKind {
  if (b.number === 0) return "genesis";
  const kinds = b.transactions.map((t) => t.kind);
  if (kinds.includes("batch")) return "batch";
  if (kinds.includes("anchor")) return "anchor";
  if (kinds.includes("deploy")) return "deploy";
  return "other";
}

function blockFirs(b: ChainBlockView): ChainFirNode[] {
  return b.transactions.flatMap((t) => t.firs);
}

function matchesQuery(f: ChainFirNode, q: string) {
  return (
    f.title.toLowerCase().includes(q) ||
    f.externalReference.toLowerCase().includes(q) ||
    f.contentHash.toLowerCase().includes(q)
  );
}

export function ChainPage() {
  const [data, setData] = useState<ChainOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const flowRef = useRef<HTMLDivElement>(null);
  const lastLatest = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await getChain();
      setData(d);
      setError(null);
    } catch {
      setError("Could not read the chain. Ensure the Hardhat node, contract address, and API are running.");
    }
  }, []);

  useEffect(() => {
    void load();
    if (!live) return;
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load, live]);

  const scrollToBlock = useCallback((n: number) => {
    const el = flowRef.current?.querySelector<HTMLElement>(`#block-${n}`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, []);

  useEffect(() => {
    if (!data) return;
    if (lastLatest.current !== data.latestBlock) {
      const firstLoad = lastLatest.current === null;
      lastLatest.current = data.latestBlock;
      setSelected((s) => (firstLoad || s === null ? data.latestBlock : s));
      requestAnimationFrame(() => scrollToBlock(data.latestBlock));
    }
  }, [data, scrollToBlock]);

  const q = query.trim().toLowerCase();

  const stats = useMemo(() => {
    const firs = data?.blocks.flatMap(blockFirs) ?? [];
    return { firs: firs.length, tampered: firs.filter((f) => !f.matchesChain).length };
  }, [data]);

  const hitBlocks = useMemo(() => {
    if (!data || !q) return null;
    return new Set(data.blocks.filter((b) => blockFirs(b).some((f) => matchesQuery(f, q))).map((b) => b.number));
  }, [data, q]);

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hitBlocks || hitBlocks.size === 0) return;
    const first = [...hitBlocks].sort((a, b) => a - b)[0]!;
    setSelected(first);
    scrollToBlock(first);
  }

  const selectedBlock = data?.blocks.find((b) => b.number === selected) ?? null;
  const selectedPrev = selectedBlock ? data?.blocks.find((b) => b.number === selectedBlock.number - 1) : undefined;

  return (
    <main className="panel chain-page">
      <div className="chain-header">
        <div>
          <h1>Blockchain view</h1>
          <p className="muted">
            Every block stores the hash of the block before it. Click a block to inspect it.
          </p>
        </div>
        <div className="chain-controls">
          <form onSubmit={onSearchSubmit}>
            <input
              className="chain-search"
              placeholder="Find FIR by title, reference or hash…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          <button
            type="button"
            className={`chain-pill ${live ? "on" : ""}`}
            onClick={() => setLive((v) => !v)}
            title="Reload every 5 seconds"
          >
            <span className="chain-pulse" /> {live ? "Live" : "Paused"}
          </button>
          <button type="button" onClick={() => void load()}>
            Refresh
          </button>
          {data && (
            <button
              type="button"
              onClick={() => {
                setSelected(data.latestBlock);
                scrollToBlock(data.latestBlock);
              }}
            >
              Latest →
            </button>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {data && (
        <>
          <div className="chain-stats">
            <Stat label="Chain ID" value={String(data.chainId)} />
            <Stat label="Blocks" value={String(data.latestBlock + 1)} />
            <Stat label="Anchor transactions" value={String(data.totalAnchors)} />
            <Stat label="FIRs on chain" value={String(stats.firs)} />
            <Stat
              label="Integrity"
              value={stats.tampered === 0 ? "All match" : `${stats.tampered} tampered`}
              tone={stats.tampered === 0 ? "good" : "bad"}
            />
            <Stat label="FIRAnchor contract" value={short(data.contractAddress, 8, 6)} mono title={data.contractAddress} />
          </div>

          <div className="chain-legend">
            {(["genesis", "deploy", "anchor", "batch"] as const).map((k) => (
              <span key={k} className="chain-legend-item">
                <span className={`chain-dot ${k}`} /> {KIND_LABEL[k]}
              </span>
            ))}
            <span className="chain-legend-item">
              <span className="chain-dot tampered" /> DB no longer matches chain
            </span>
            {hitBlocks && (
              <span className="chain-legend-item">
                {hitBlocks.size} block{hitBlocks.size === 1 ? "" : "s"} match “{query.trim()}”
              </span>
            )}
          </div>

          <div className="chain-flow" ref={flowRef}>
            {data.blocks.map((b, i) => {
              const prev = data.blocks[i - 1];
              const linked = prev ? prev.hash === b.parentHash : null;
              return (
                <Fragment key={b.number}>
                  {prev && (
                    <div className={`chain-arrow ${linked ? "ok" : "broken"}`} title={`parentHash = ${b.parentHash}`}>
                      <span className="mono">{short(prev.hash, 4, 3)}</span>
                      <div className="chain-arrow-line" />
                      <span>{linked ? "linked" : "broken"}</span>
                    </div>
                  )}
                  <BlockNode
                    block={b}
                    selected={b.number === selected}
                    dimmed={hitBlocks !== null && !hitBlocks.has(b.number)}
                    query={q}
                    onSelect={() => setSelected(b.number)}
                  />
                </Fragment>
              );
            })}
          </div>

          {selectedBlock && <BlockDetail block={selectedBlock} prev={selectedPrev} query={q} />}
        </>
      )}
    </main>
  );
}

function Stat(props: { label: string; value: string; tone?: "good" | "bad"; mono?: boolean; title?: string }) {
  return (
    <div className={`chain-stat ${props.tone ?? ""}`} title={props.title}>
      <div className="muted">{props.label}</div>
      <strong className={props.mono ? "mono" : undefined}>{props.value}</strong>
    </div>
  );
}

function BlockNode(props: {
  block: ChainBlockView;
  selected: boolean;
  dimmed: boolean;
  query: string;
  onSelect: () => void;
}) {
  const { block, selected, dimmed, query, onSelect } = props;
  const kind = blockKind(block);
  const firs = blockFirs(block);
  const tampered = firs.some((f) => !f.matchesChain);
  const anchorTx = block.transactions.find((t) => t.kind === "anchor" || t.kind === "batch");
  const shown = firs.slice(0, FIRS_PER_NODE);

  return (
    <button
      type="button"
      id={`block-${block.number}`}
      className={`chain-node ${kind} ${tampered ? "tampered" : ""} ${selected ? "selected" : ""} ${dimmed ? "dimmed" : ""}`}
      onClick={onSelect}
    >
      <div className="chain-node-head">
        <strong>#{block.number}</strong>
        <span className="chain-badge">{KIND_LABEL[kind]}</span>
      </div>
      <div className="chain-kv">
        <span className="muted">hash</span>
        <span className="mono">{short(block.hash)}</span>
        <span className="muted">prev</span>
        <span className="mono">{short(block.parentHash)}</span>
        <span className="muted">time</span>
        <span>{new Date(block.timestamp * 1000).toLocaleTimeString()}</span>
      </div>

      {kind === "deploy" && <div className="chain-node-note">FIRAnchor smart contract created</div>}
      {kind === "genesis" && <div className="chain-node-note">Start of the chain</div>}

      {anchorTx && (
        <div className="chain-node-body">
          <div className="chain-kv">
            <span className="muted">{anchorTx.kind === "batch" ? "root" : "anchored"}</span>
            <span className="mono">{short(anchorTx.anchoredHash)}</span>
          </div>
          {firs.length === 0 && <div className="chain-node-note warn">FIR missing from database</div>}
          <ul className="chain-firs">
            {shown.map((f) => (
              <li
                key={f.id}
                className={`${f.matchesChain ? "ok" : "tampered"} ${query && matchesQuery(f, query) ? "hit" : ""}`}
              >
                <span className="chain-fir-title">{f.title}</span>
                <span className="chain-fir-meta">
                  <span className="mono">{short(f.contentHash)}</span>
                  <span className={f.matchesChain ? "success" : "error"}>
                    {f.matchesChain ? "✓ matches" : "✗ tampered"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {firs.length > FIRS_PER_NODE && (
            <div className="chain-node-note">+{firs.length - FIRS_PER_NODE} more FIRs (click to view)</div>
          )}
        </div>
      )}
    </button>
  );
}

function BlockDetail(props: { block: ChainBlockView; prev?: ChainBlockView; query: string }) {
  const { block, prev, query } = props;
  const kind = blockKind(block);
  const linked = prev ? prev.hash === block.parentHash : null;

  return (
    <section className={`chain-detail ${kind}`}>
      <div className="chain-detail-head">
        <h2>
          Block #{block.number} <span className="chain-badge">{KIND_LABEL[kind]}</span>
        </h2>
        <span className="muted">{new Date(block.timestamp * 1000).toLocaleString()}</span>
      </div>

      <dl className="chain-detail-grid">
        <dt>Block hash</dt>
        <dd className="mono">{block.hash}</dd>
        <dt>Parent hash</dt>
        <dd>
          <span className="mono">{block.parentHash}</span>
          {linked !== null && (
            <span className={`chain-check ${linked ? "ok" : "bad"}`}>
              {linked ? `✓ equals hash of block #${prev!.number}` : `✗ does not match block #${prev!.number}`}
            </span>
          )}
          {block.number === 0 && <span className="chain-check">genesis has no parent</span>}
        </dd>
        <dt>Transactions</dt>
        <dd>{block.transactions.length}</dd>
      </dl>

      {block.transactions.map((t) => (
        <TxDetail key={t.hash} tx={t} query={query} />
      ))}
    </section>
  );
}

function TxDetail({ tx, query }: { tx: ChainTxView; query: string }) {
  return (
    <div className="chain-detail-tx">
      <dl className="chain-detail-grid">
        <dt>Transaction</dt>
        <dd className="mono">{tx.hash}</dd>
        {tx.kind === "deploy" && (
          <>
            <dt>Action</dt>
            <dd>Deployed the FIRAnchor smart contract</dd>
          </>
        )}
        {tx.kind === "anchor" && (
          <>
            <dt>Action</dt>
            <dd>
              <code>anchor(contentHash, externalId)</code>: one FIR fingerprint
            </dd>
            <dt>Anchored hash</dt>
            <dd className="mono">{tx.anchoredHash}</dd>
            <dt>FIR reference</dt>
            <dd className="mono">{tx.ref}</dd>
          </>
        )}
        {tx.kind === "batch" && (
          <>
            <dt>Action</dt>
            <dd>
              <code>anchorBatch(merkleRoot, batchId)</code>: {tx.firs.length} FIRs under one root
            </dd>
            <dt>Merkle root</dt>
            <dd className="mono">{tx.anchoredHash}</dd>
            <dt>Batch ID</dt>
            <dd className="mono">{tx.ref}</dd>
          </>
        )}
      </dl>

      {(tx.kind === "anchor" || tx.kind === "batch") && (
        <table className="table chain-fir-table">
          <thead>
            <tr>
              <th>FIR</th>
              <th>Content hash (from database)</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tx.firs.length === 0 && (
              <tr>
                <td colSpan={4} className="error">
                  No FIR in the database for this anchor. The record may have been deleted, but the chain still
                  proves it existed.
                </td>
              </tr>
            )}
            {tx.firs.map((f) => (
              <tr key={f.id} className={query && matchesQuery(f, query) ? "chain-row-hit" : undefined}>
                <td>
                  <strong>{f.title}</strong>
                  <div className="muted mono">{short(f.externalReference, 8, 4)}</div>
                </td>
                <td className="mono wrap">{f.contentHash}</td>
                <td>
                  <span className={`chain-status ${f.matchesChain ? "ok" : "bad"}`}>
                    {f.matchesChain ? "✓ Matches chain" : "✗ Tampered"}
                  </span>
                </td>
                <td>
                  <Link to={`/firs/${f.id}`}>Open</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
