/**
 * Demo-only insider-attack simulator for the jury demonstration (local use only).
 * Usage: npx tsx scripts/demo-tamper.ts <firId> naive|smart|restore
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { canonicalizePayload, firContentHash, type FirPayload } from "../src/lib/hashCanonical.js";

const prisma = new PrismaClient();
const [, , firId, mode] = process.argv;

if (!firId || !["naive", "smart", "restore"].includes(mode ?? "")) {
  console.log("Usage: npx tsx scripts/demo-tamper.ts <firId> naive|smart|restore");
  process.exit(1);
}

const backupFile = path.join(process.cwd(), `demo-backup-${firId}.json`);

async function main() {
  const fir = await prisma.fir.findUnique({ where: { id: firId } });
  if (!fir) throw new Error(`FIR ${firId} not found`);

  if (mode === "restore") {
    if (!fs.existsSync(backupFile)) throw new Error("No backup found; nothing to restore");
    const b = JSON.parse(fs.readFileSync(backupFile, "utf8"));
    await prisma.fir.update({
      where: { id: firId },
      data: {
        description: b.description,
        canonicalPayloadJson: b.canonicalPayloadJson,
        contentHash: b.contentHash,
        integrityStatus: "OK",
      },
    });
    fs.unlinkSync(backupFile);
    console.log("Restored original record. Hash:", b.contentHash);
    return;
  }

  if (!fs.existsSync(backupFile)) {
    fs.writeFileSync(
      backupFile,
      JSON.stringify({
        description: fir.description,
        canonicalPayloadJson: fir.canonicalPayloadJson,
        contentHash: fir.contentHash,
      }),
    );
  }

  const forgedDescription = fir.description.replace(/Ali Raza/g, "Bilal Khan") + " [altered]";

  if (mode === "naive") {
    await prisma.fir.update({ where: { id: firId }, data: { description: forgedDescription } });
    console.log("NAIVE tamper: description changed; hash left untouched.");
    return;
  }

  const original = JSON.parse(fir.canonicalPayloadJson) as FirPayload;
  const forgedPayload: FirPayload = { ...original, description: forgedDescription };
  const forgedHash = firContentHash(forgedPayload);
  await prisma.fir.update({
    where: { id: firId },
    data: {
      description: forgedDescription,
      canonicalPayloadJson: canonicalizePayload(forgedPayload),
      contentHash: forgedHash,
    },
  });
  console.log("SMART tamper: text, canonical JSON and hash all rewritten.");
  console.log("  original hash:", fir.contentHash);
  console.log("  forged hash:  ", forgedHash);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
