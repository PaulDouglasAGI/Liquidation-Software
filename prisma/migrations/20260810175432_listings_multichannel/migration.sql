-- CreateEnum
CREATE TYPE "ListingChannel" AS ENUM ('EBAY', 'AMAZON', 'FACEBOOK', 'OTHER');

-- CreateEnum
CREATE TYPE "ListingEndReason" AS ENUM ('AUTO', 'MANUAL', 'SOLD_HERE', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "channel" "ListingChannel" NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "price" DECIMAL(12,2),
    "listedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" "ListingEndReason",
    "needsTakedownAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_endedAt_idx" ON "Listing"("endedAt");

-- CreateIndex
CREATE INDEX "Listing_needsTakedownAt_idx" ON "Listing"("needsTakedownAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_itemId_channel_key" ON "Listing"("itemId", "channel");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
