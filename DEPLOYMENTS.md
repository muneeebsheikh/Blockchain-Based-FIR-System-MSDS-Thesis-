# Deployments and chain inspection

This thesis research codebase does **not** expose contract metadata in the web UI. Use this file plus generated JSON under `contracts/deployments/` after each deploy.

## Local Hardhat node

1. Terminal A — start an RPC node (chain id `31337` by default in `contracts/hardhat.config.ts`):

   `cd code/contracts && npx hardhat node`

2. Terminal B — deploy `FIRAnchor`:

   `cd code/contracts && npx hardhat run scripts/deploy.ts --network localhost`

3. Open `code/contracts/deployments/localhost/FIRAnchor.json` and copy `address` into `code/backend/.env` as `FIR_CONTRACT_ADDRESS`.

4. Point `RPC_URL` at `http://127.0.0.1:8545` and set `SIGNER_PRIVATE_KEY` to a funded local key (see `code/backend/env.example` for the well-known Hardhat dev key #0 — **local only**).

## Inspecting state without a product screen

- **CLI**: `cd code/contracts && npx hardhat console --network localhost` then call `FIRAnchor` view functions.
- **Artifacts**: contract ABI and bytecode live under `code/contracts/artifacts/contracts/FIRAnchor.sol/FIRAnchor.json`.

## Backend environment alignment

The API reads `FIR_CONTRACT_ADDRESS`, `RPC_URL`, and `SIGNER_PRIVATE_KEY` to anchor new FIR hashes. If these disagree with the running node, anchoring fails with HTTP 502 from `POST /api/firs`.
