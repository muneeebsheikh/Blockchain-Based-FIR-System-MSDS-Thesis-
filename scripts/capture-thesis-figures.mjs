/**
 * Captures thesis report screenshots (S1–S4, optional S6) into Report/figures.
 * Prerequisites: Hardhat node, deployed FIRAnchor, backend + DB + seeded users, Vite dev on 127.0.0.1:5173.
 *
 * Run from repo `code/`: npm run figures:capture
 */
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const codeRoot = path.join(__dirname, "..");
const thesisRoot = path.join(codeRoot, "..");
const FIGURES =
  process.env.THESIS_FIGURES_DIR || path.join(thesisRoot, "Report", "figures");
const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const API_HEALTH = process.env.API_HEALTH_URL || "http://127.0.0.1:4000/health";

const PASS = "ChangeMe123!";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function waitForHealth(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(API_HEALTH, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const j = await res.json();
        if (j.ok && j.db) return true;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function main() {
  ensureDir(FIGURES);

  const ok = await waitForHealth();
  if (!ok) {
    console.error(
      `Backend not healthy at ${API_HEALTH} (need Postgres + migrated DB + chain + FIR_CONTRACT_ADDRESS). Start stack first.`,
    );
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // S1 — login
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.screenshot({ path: path.join(FIGURES, "S1-login.png"), fullPage: true });

  // Citizen flow → S2
  await page.locator('input[type="email"]').fill("citizen@local.test");
  await page.locator('input[type="password"]').fill(PASS);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/submit/, { timeout: 30_000 });

  await page.locator('label:has-text("Title") input').fill("Thesis report demo FIR");
  await page
    .locator('label:has-text("Description") textarea')
    .fill(
      "Demonstration narrative for automated thesis screenshots. Incident details exceed minimum length for validation.",
    );
  await page.getByRole("button", { name: "Submit and anchor" }).click();
  await page.getByText(/Anchored\. Reference/, { timeout: 60_000 }).waitFor();
  await page.screenshot({ path: path.join(FIGURES, "S2-submit-fir.png"), fullPage: true });

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });

  // Officer flow → S3, S4
  await page.locator('input[type="email"]').fill("officer@local.test");
  await page.locator('input[type="password"]').fill(PASS);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/queue/, { timeout: 30_000 });
  await page.getByRole("heading", { name: /FIR queue/i }).waitFor();
  await page.screenshot({ path: path.join(FIGURES, "S3-officer-queue.png"), fullPage: true });

  await page.getByRole("link", { name: "Open" }).first().click();
  await page.waitForURL(/\/firs\//, { timeout: 15_000 });
  await page.getByRole("button", { name: /Full verification/ }).click();
  await page.getByText(/Hash present on-chain/).waitFor({ timeout: 60_000 });
  await page.screenshot({ path: path.join(FIGURES, "S4-fir-detail-verify.png"), fullPage: true });

  // S6 — health JSON (optional)
  const healthPage = await context.newPage();
  await healthPage.goto(API_HEALTH, { waitUntil: "domcontentloaded" });
  await healthPage.screenshot({ path: path.join(FIGURES, "S6-health.png"), fullPage: true });
  await healthPage.close();

  // S5 — smoke pipeline output (styled like a terminal for the report)
  let smokeOut = "";
  try {
    smokeOut = execSync("npm run smoke", {
      cwd: codeRoot,
      encoding: "utf8",
      maxBuffer: 10_000_000,
      shell: true,
    });
  } catch (e) {
    smokeOut = `${e.stdout || ""}${e.stderr || ""}\n${e.message || e}`;
  }
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const smokePage = await context.newPage();
  await smokePage.setViewportSize({ width: 900, height: 1200 });
  await smokePage.setContent(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
      body { margin:0; padding:16px; font: 13px/1.4 Consolas, monospace; background:#0c0c0c; color:#d4d4d4; }
      pre { white-space: pre-wrap; word-break: break-word; margin:0; }
      h1 { font: 600 14px Segoe UI, sans-serif; color:#fff; margin:0 0 12px; }
    </style></head><body><h1>npm run smoke (code workspace)</h1><pre>${esc(smokeOut)}</pre></body></html>`,
  );
  await smokePage.screenshot({ path: path.join(FIGURES, "S5-smoke-terminal.png"), fullPage: true });
  await smokePage.close();

  await browser.close();
  console.log("Figures written to", FIGURES);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
