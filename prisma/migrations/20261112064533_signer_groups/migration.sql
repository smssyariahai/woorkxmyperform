-- AlterTable
ALTER TABLE "EsignSigner" ADD COLUMN     "signingGroup" INTEGER NOT NULL DEFAULT 0;

-- Backfill: tiap signer lama jadi grup sendiri (grup = urutan lama),
-- agar dokumen yang sudah berjalan berperilaku sama seperti sebelumnya.
UPDATE "EsignSigner" SET "signingGroup" = "signingOrder";

