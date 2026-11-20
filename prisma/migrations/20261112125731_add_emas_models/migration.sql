-- CreateTable
CREATE TABLE "GoldPriceHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "priceDate" DATE NOT NULL,
    "prices" JSONB NOT NULL DEFAULT '{}',
    "buybackPrices" JSONB NOT NULL DEFAULT '{}',
    "hargaTaksir24K" DOUBLE PRECISION,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoldSetting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoldSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KirimUrl" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'simulasi',
    "judul" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "deskripsi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KirimUrl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoldPriceHistory_organizationId_priceDate_idx" ON "GoldPriceHistory"("organizationId", "priceDate");

-- CreateIndex
CREATE UNIQUE INDEX "GoldPriceHistory_organizationId_priceDate_key" ON "GoldPriceHistory"("organizationId", "priceDate");

-- CreateIndex
CREATE INDEX "Simulation_organizationId_userId_createdAt_idx" ON "Simulation"("organizationId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GoldSetting_organizationId_key_key" ON "GoldSetting"("organizationId", "key");

-- CreateIndex
CREATE INDEX "KirimUrl_organizationId_scope_idx" ON "KirimUrl"("organizationId", "scope");

-- AddForeignKey
ALTER TABLE "GoldPriceHistory" ADD CONSTRAINT "GoldPriceHistory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoldSetting" ADD CONSTRAINT "GoldSetting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KirimUrl" ADD CONSTRAINT "KirimUrl_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

