-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "soldPrice" DECIMAL(12,2),
    "feesAmount" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderLine_itemId_idx" ON "OrderLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_orderId_itemId_key" ON "OrderLine"("orderId", "itemId");

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing order's lines come from the items still pointing at
-- it. Without this an upgrade leaves every historical order showing as empty —
-- the data is there, but the packing slips and the queue read lines now.
INSERT INTO "OrderLine" ("id", "orderId", "itemId", "sku", "name", "soldPrice", "feesAmount", "createdAt")
SELECT
  gen_random_uuid()::text,
  i."orderRecordId",
  i."id",
  i."sku",
  i."name",
  i."soldPrice",
  i."feesAmount",
  COALESCE(o."soldAt", o."createdAt")
FROM "Item" i
JOIN "Order" o ON o."id" = i."orderRecordId"
WHERE i."orderRecordId" IS NOT NULL;
