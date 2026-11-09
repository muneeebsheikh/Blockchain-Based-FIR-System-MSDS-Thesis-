# FIR integrity system — thesis implementation (code)

MS thesis research implementation: web app + Express API + PostgreSQL + Solidity anchor on a local Ethereum-compatible chain.

**Thesis-II increment (Merkle batching):** see [`../Report/Thesis_II_Increment_Plan.md`](../Report/Thesis_II_Increment_Plan.md). Phase I single-hash `anchor` remains; officers/admins can also `POST /api/firs/batch` to commit many FIR hashes under one Merkle root via `anchorBatch`. Officer verify UI shows leaf, root, proof length, and pass/fail.

## Layout

- `contracts/` — Hardhat, `FIRAnchor` contract (single + batch), deploy script, tests
- `backend/` — Express + Prisma + JWT roles + on-chain anchoring + Merkle helper
- `frontend/` — Vite + React + TypeScript
- `docs/LOCAL_SETUP.md` — PostgreSQL bootstrap notes

## Prerequisites

See `docs/LOCAL_SETUP.md` for database creation.

Install dependencies:

```powershell
cd code/contracts; npm install
cd ../backend; npm install
cd ../frontend; npm install
```

## Configure environment

- Backend: copy `backend/env.example` to `backend/.env` and fill `DATABASE_URL`, `JWT_SECRET`, contract address, RPC, signer key.
- Frontend: copy `frontend/env.example` to `frontend/.env.local`.

Deploy the contract and wire `FIR_CONTRACT_ADDRESS`: see [DEPLOYMENTS.md](DEPLOYMENTS.md).

## Database

From `backend/`:

```powershell
npx prisma migrate deploy
npm run db:seed
```

Seeded dev users (password `ChangeMe123!`):

- `citizen@local.test` (citizen)
- `officer@local.test` (officer)
- `admin@local.test` (admin)

## Run locally

Terminal 1 — chain:

```powershell
cd code/contracts
npx hardhat node
```

Terminal 2 — deploy `FIRAnchor` (once per chain reset):

```powershell
cd code/contracts
npx hardhat run scripts/deploy.ts --network localhost
```

Terminal 3 — API:

```powershell
cd code/backend
npm run dev
```

Terminal 4 — web:

```powershell
cd code/frontend
npm run dev
```

## Smoke checks (no Postgres required)

From `code/`:

```powershell
npm install
npm run smoke
```

This runs contract tests, backend typecheck, and a frontend production build.

## Thesis report screenshots (automated)

From `code/` install workspace tooling once (includes Playwright):

```powershell
cd code
npm install
npx playwright install chromium
```

With **PostgreSQL** available and `.env` configured for the backend, start the full stack (Hardhat node → deploy `FIRAnchor` → set `FIR_CONTRACT_ADDRESS` for the backend process if it changed → `npx prisma migrate deploy` / `npm run db:seed` as needed → backend `npm run dev` → frontend `npm run dev -- --host localhost --port 5173` so CORS matches `CORS_ORIGIN`).

Then capture figures into `Report/figures/`:

```powershell
cd code
$env:BASE_URL = "http://localhost:5173"
npm run figures:capture
```

This runs `scripts/capture-thesis-figures.mjs` (seeded users `citizen@local.test` / `officer@local.test`, password `ChangeMe123!`). Override output with `$env:THESIS_FIGURES_DIR="D:\path\to\figures"`.
