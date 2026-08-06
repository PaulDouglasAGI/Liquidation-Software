-- Lot Performance: labor tracking and the lot-level fields the five metrics
-- need. Every column added here is nullable or defaulted, so existing pallets
-- and items keep working untouched.

-- CreateEnum
CREATE TYPE "ConditionGrade" AS ENUM ('NEW', 'SHELF_PULL', 'OVERSTOCK', 'CUSTOMER_RETURNS', 'SALVAGE', 'MIXED');

-- CreateEnum
CREATE TYPE "LaborActivity" AS ENUM ('PICKUP_TRANSPORT', 'TESTING_SORTING', 'PHOTOGRAPHING_LISTING', 'PACKING_SHIPPING', 'OTHER');

-- CreateEnum
CREATE TYPE "ValueClass" AS ENUM ('FLOOR', 'SPECULATIVE');

-- CreateEnum
CREATE TYPE "DudReason" AS ENUM ('NON_FUNCTIONAL', 'MISSING_PARTS', 'MISSING_BATTERY', 'DAMAGED', 'NOT_AS_MANIFESTED', 'OTHER');

-- AlterEnum
-- Pre-pickup states, so a lot can be tracked from the moment we start bidding.
-- Safe inside the migration transaction because nothing below references them.
ALTER TYPE "PalletStatus" ADD VALUE IF NOT EXISTS 'BIDDING';
ALTER TYPE "PalletStatus" ADD VALUE IF NOT EXISTS 'WON';

-- AlterEnum
-- The categories that actually show up in home-improvement liquidation.
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'ELECTRICAL_LIGHTING';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'PLUMBING';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'GENERAL_HOME';

-- AlterTable
ALTER TABLE "Pallet" ADD COLUMN     "sourceLotId" TEXT,
ADD COLUMN     "fees" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "conditionGrade" "ConditionGrade" NOT NULL DEFAULT 'MIXED',
ADD COLUMN     "manifestUnitCount" INTEGER,
ADD COLUMN     "actualUnitCount" INTEGER,
ADD COLUMN     "manifestRetailTotal" DECIMAL(12,2),
ADD COLUMN     "preBidEstimatedRecovery" DECIMAL(12,2),
ADD COLUMN     "pickupDate" TIMESTAMP(3);

-- Backfill: every timing metric runs off pickupDate, and for lots recorded
-- before this module existed the purchase date is the only arrival date we
-- have. Leaving it null would silently drop those lots out of days-to-listing
-- and sell-through instead of reporting them.
UPDATE "Pallet" SET "pickupDate" = "purchaseDate" WHERE "pickupDate" IS NULL;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "valueClass" "ValueClass",
ADD COLUMN     "isDud" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dudReason" "DudReason";

-- CreateTable
CREATE TABLE "LaborEntry" (
    "id" TEXT NOT NULL,
    "palletId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "activity" "LaborActivity" NOT NULL DEFAULT 'TESTING_SORTING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LaborEntry_palletId_idx" ON "LaborEntry"("palletId");

-- CreateIndex
CREATE INDEX "LaborEntry_userId_idx" ON "LaborEntry"("userId");

-- CreateIndex
CREATE INDEX "LaborEntry_date_idx" ON "LaborEntry"("date");

-- CreateIndex
CREATE INDEX "Item_isDud_idx" ON "Item"("isDud");

-- AddForeignKey
ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_palletId_fkey" FOREIGN KEY ("palletId") REFERENCES "Pallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaborEntry" ADD CONSTRAINT "LaborEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
