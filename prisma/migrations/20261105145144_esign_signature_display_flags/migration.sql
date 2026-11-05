-- AlterTable
ALTER TABLE "EsignDocument" ADD COLUMN     "showDocRef" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showSignedDate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showSignerName" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showSignerPosition" BOOLEAN NOT NULL DEFAULT true;
