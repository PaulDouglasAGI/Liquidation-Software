-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'STAFF');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'STAFF';

-- Backfill: the first account created owns the install. Without this an
-- existing deployment would upgrade into a state where every user is STAFF
-- and nobody can manage users or restore a backup.
UPDATE "User" SET "role" = 'OWNER'
WHERE "id" = (SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1);
