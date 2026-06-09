-- CreateEnum
CREATE TYPE "PalletStatus" AS ENUM ('RECEIVED', 'IN_PROCESSING', 'PARTIALLY_LISTED', 'FULLY_LISTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('POWER_TOOLS', 'HAND_TOOLS', 'HARDWARE', 'APPLIANCES', 'MIXED');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'FOR_PARTS');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('IN_STOCK', 'LISTED', 'SOLD', 'RETURNED', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('EBAY', 'AMAZON', 'FACEBOOK', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pallet" (
    "id" TEXT NOT NULL,
    "palletCode" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "manifestUrl" TEXT,
    "category" "ProductCategory" NOT NULL DEFAULT 'MIXED',
    "status" "PalletStatus" NOT NULL DEFAULT 'RECEIVED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "palletId" TEXT NOT NULL,
    "upc" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" "ProductCategory" NOT NULL DEFAULT 'MIXED',
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "conditionNotes" TEXT,
    "msrp" DECIMAL(12,2),
    "ourCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sellPrice" DECIMAL(12,2),
    "soldPrice" DECIMAL(12,2),
    "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serialNumber" TEXT,
    "weightLbs" DECIMAL(8,2),
    "lengthIn" DECIMAL(8,2),
    "widthIn" DECIMAL(8,2),
    "heightIn" DECIMAL(8,2),
    "storageLocation" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'IN_STOCK',
    "platform" "Platform",
    "listingUrl" TEXT,
    "listingIdEbay" TEXT,
    "listingIdAmazon" TEXT,
    "dateListed" TIMESTAMP(3),
    "dateSold" TIMESTAMP(3),
    "orderId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPurchase" (
    "id" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "manifestId" TEXT,
    "category" TEXT,
    "palletsBought" INTEGER NOT NULL DEFAULT 1,
    "totalPaid" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ListingTemplate" (
    "id" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "titleTemplate" TEXT NOT NULL,
    "descriptionTemplate" TEXT NOT NULL,

    CONSTRAINT "ListingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageLocation" (
    "code" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "StorageLocation_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Pallet_palletCode_key" ON "Pallet"("palletCode");

-- CreateIndex
CREATE UNIQUE INDEX "Item_sku_key" ON "Item"("sku");

-- CreateIndex
CREATE INDEX "Item_palletId_idx" ON "Item"("palletId");

-- CreateIndex
CREATE INDEX "Item_status_idx" ON "Item"("status");

-- CreateIndex
CREATE INDEX "Item_upc_idx" ON "Item"("upc");

-- CreateIndex
CREATE INDEX "Item_storageLocation_idx" ON "Item"("storageLocation");

-- CreateIndex
CREATE UNIQUE INDEX "ListingTemplate_category_key" ON "ListingTemplate"("category");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_palletId_fkey" FOREIGN KEY ("palletId") REFERENCES "Pallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
