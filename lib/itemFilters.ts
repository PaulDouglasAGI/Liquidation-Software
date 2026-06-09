import "server-only";
import { Prisma } from "@prisma/client";
import { CATEGORIES, CONDITIONS, ITEM_STATUSES, PLATFORMS } from "./constants";

export interface ItemFilterParams {
  [key: string]: string | string[] | undefined;
}

const pick = (p: ItemFilterParams, key: string): string => {
  const v = p[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
};

const inEnum = <T extends readonly string[]>(v: string, allowed: T) =>
  (allowed as readonly string[]).includes(v) ? v : "";

/** Builds a Prisma `where` for the inventory table + CSV export from URL params. */
export function buildItemWhere(p: ItemFilterParams, agingDays: number): Prisma.ItemWhereInput {
  const where: Prisma.ItemWhereInput = {};
  const and: Prisma.ItemWhereInput[] = [];

  const q = pick(p, "q").trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { upc: { contains: q } },
        { brand: { contains: q, mode: "insensitive" } },
        { storageLocation: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const palletId = pick(p, "palletId");
  if (palletId) where.palletId = palletId;
  const category = inEnum(pick(p, "category"), CATEGORIES);
  if (category) where.category = category as never;
  const condition = inEnum(pick(p, "condition"), CONDITIONS);
  if (condition) where.condition = condition as never;
  const status = inEnum(pick(p, "status"), ITEM_STATUSES);
  if (status) where.status = status as never;
  const platform = inEnum(pick(p, "platform"), PLATFORMS);
  if (platform) where.platform = platform as never;
  const location = pick(p, "location");
  if (location) where.storageLocation = location;

  const dateFrom = pick(p, "dateFrom");
  const dateTo = pick(p, "dateTo");
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59`) } : {}),
    };
  }

  const priceMin = parseFloat(pick(p, "priceMin"));
  const priceMax = parseFloat(pick(p, "priceMax"));
  if (Number.isFinite(priceMin) || Number.isFinite(priceMax)) {
    where.sellPrice = {
      ...(Number.isFinite(priceMin) ? { gte: priceMin } : {}),
      ...(Number.isFinite(priceMax) ? { lte: priceMax } : {}),
    };
  }

  // Aging = listed more than N days ago and still unsold
  if (pick(p, "aging") === "1") {
    and.push({
      status: "LISTED",
      dateListed: { lte: new Date(Date.now() - agingDays * 86_400_000) },
    });
  }

  if (and.length) where.AND = and;
  return where;
}

const SORTS: Record<string, Prisma.ItemOrderByWithRelationInput> = {
  sku: { sku: "asc" },
  name: { name: "asc" },
  cost: { ourCost: "desc" },
  price: { sellPrice: "desc" },
  status: { status: "asc" },
  location: { storageLocation: "asc" },
  listed: { dateListed: "desc" },
  created: { createdAt: "desc" },
};

export function buildItemOrderBy(p: ItemFilterParams): Prisma.ItemOrderByWithRelationInput {
  const sort = pick(p, "sort");
  const dir = pick(p, "dir") === "asc" ? "asc" : pick(p, "dir") === "desc" ? "desc" : null;
  const base = SORTS[sort] ?? SORTS.created;
  if (!dir) return base;
  const [key] = Object.keys(base);
  return { [key]: dir } as Prisma.ItemOrderByWithRelationInput;
}
