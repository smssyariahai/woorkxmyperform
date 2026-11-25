-- Tambah status pengiriman email invoice (§9.5: invoice terkirim ke email tenant).
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "emailStatus" TEXT;
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "emailSentAt" TIMESTAMP(3);
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "emailTo" TEXT;
ALTER TABLE "SubscriptionInvoice" ADD COLUMN "emailError" TEXT;
