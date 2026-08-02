-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PICK', 'PICKED', 'PACKED', 'SHIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('DRAFT', 'LISTED', 'SOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CountStatus" AS ENUM ('OPEN', 'CLOSED');

-- AlterEnum
ALTER TYPE "ItemStatus" ADD VALUE 'RESERVED';

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "lotId" TEXT,
ADD COLUMN     "orderRecordId" TEXT,
ADD COLUMN     "reservedFor" TEXT,
ADD COLUMN     "reservedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "externalId" TEXT,
    "platform" "Platform",
    "buyerName" TEXT,
    "shipToName" TEXT,
    "shipToLine1" TEXT,
    "shipToLine2" TEXT,
    "shipToCity" TEXT,
    "shipToState" TEXT,
    "shipToPostal" TEXT,
    "shipToCountry" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PICK',
    "soldAt" TIMESTAMP(3),
    "shipByDate" TIMESTAMP(3),
    "pickedAt" TIMESTAMP(3),
    "packedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "carrier" TEXT,
    "trackingNumber" TEXT,
    "shippingPaid" DECIMAL(12,2),
    "shippingCost" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "askingPrice" DECIMAL(12,2),
    "status" "LotStatus" NOT NULL DEFAULT 'DRAFT',
    "platform" "Platform",
    "soldPrice" DECIMAL(12,2),
    "dateListed" TIMESTAMP(3),
    "dateSold" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountSession" (
    "id" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" "CountStatus" NOT NULL DEFAULT 'OPEN',
    "startedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "CountSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountScan" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "itemId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_externalId_idx" ON "Order"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_lotCode_key" ON "Lot"("lotCode");

-- CreateIndex
CREATE INDEX "Lot_status_idx" ON "Lot"("status");

-- CreateIndex
CREATE INDEX "CountSession_location_idx" ON "CountSession"("location");

-- CreateIndex
CREATE INDEX "CountSession_status_idx" ON "CountSession"("status");

-- CreateIndex
CREATE INDEX "CountScan_sessionId_idx" ON "CountScan"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CountScan_sessionId_sku_key" ON "CountScan"("sessionId", "sku");

-- CreateIndex
CREATE INDEX "SavedView_userId_idx" ON "SavedView"("userId");

-- CreateIndex
CREATE INDEX "Item_orderRecordId_idx" ON "Item"("orderRecordId");

-- CreateIndex
CREATE INDEX "Item_lotId_idx" ON "Item"("lotId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_orderRecordId_fkey" FOREIGN KEY ("orderRecordId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountScan" ADD CONSTRAINT "CountScan_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CountSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
