-- Collapse any duplicate marketplace orders created before the constraint
-- existed: keep the earliest, move its lines onto it, delete the rest.
WITH ranked AS (
  SELECT id, "externalId",
         ROW_NUMBER() OVER (PARTITION BY "externalId" ORDER BY "createdAt", id) AS rn,
         FIRST_VALUE(id) OVER (PARTITION BY "externalId" ORDER BY "createdAt", id) AS keep_id
  FROM "Order"
  WHERE "externalId" IS NOT NULL
)
UPDATE "Item" i SET "orderRecordId" = r.keep_id
FROM ranked r
WHERE i."orderRecordId" = r.id AND r.rn > 1;

DELETE FROM "Order" o
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "externalId" ORDER BY "createdAt", id) AS rn
  FROM "Order" WHERE "externalId" IS NOT NULL
) d
WHERE o.id = d.id AND d.rn > 1;

DROP INDEX IF EXISTS "Order_externalId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Order_externalId_key" ON "Order"("externalId");
