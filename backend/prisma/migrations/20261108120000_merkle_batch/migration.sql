-- AlterTable
ALTER TABLE "Fir" ADD COLUMN "merkleRoot" TEXT;
ALTER TABLE "Fir" ADD COLUMN "merkleProof" JSONB;
ALTER TABLE "Fir" ADD COLUMN "batchId" TEXT;
