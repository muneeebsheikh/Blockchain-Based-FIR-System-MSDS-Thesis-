import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cwd, cmd, args) {
  const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run(path.join(root, "contracts"), "npx", ["hardhat", "test"]);
run(path.join(root, "backend"), "npx", ["tsx", "src/lib/merkle.selftest.ts"]);
run(path.join(root, "backend"), "npx", ["tsc", "-p", "tsconfig.json", "--noEmit"]);
run(path.join(root, "frontend"), "npm", ["run", "build"]);

console.log("smoke: ok (contracts + merkle + backend types + frontend build)");
