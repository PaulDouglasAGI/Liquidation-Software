// Pure query-building from URL params — no DB access, so it stays unit-testable.
import type { Prisma } from "@prisma/client";
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
export function buildItemWhere(p: ItemFilterParams, agingDays: number, now = new Date()): Prisma.ItemWhereInput {
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

  // Aging = held more than N days and still unsold.
  //
  // Two ways stock goes stale, and only one of them involves a listing: a unit
  // listed N days ago that nobody bought, and a unit that has sat since
  // intake because nobody ever listed it. Keying this on dateListed alone hid
  // the second kind entirely — the oldest, deadest stock in the building was
  // the one thing no aging view could show.
  if (pick(p, "aging") === "1") {
    const cutoff = new Date(now.getTime() - agingDays * 86_400_000);
    and.push({
      OR: [
        { status: "LISTED", dateListed: { lte: cutoff } },
        // Never listed: age from when it physically arrived.
        {
          status: { in: ["IN_STOCK", "RESERVED"] },
          dateListed: null,
          pallet: { is: { pickupDate: { lte: cutoff } } },
        },
      ],
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

export function buildItemOrderBy(p: ItemFilterParams): Prisma.ItemOrderByWithRelationInput[] {
  const sort = pick(p, "sort");
  const dir = pick(p, "dir") === "asc" ? "asc" : pick(p, "dir") === "desc" ? "desc" : null;
  // Own-property check: a bare index would resolve "constructor"/"toString"
  // off Object.prototype and hand Prisma a function.
  let base = Object.prototype.hasOwnProperty.call(SORTS, sort) ? SORTS[sort] : SORTS.created;
  if (dir) {
    const [key] = Object.keys(base);
    base = { [key]: dir } as Prisma.ItemOrderByWithRelationInput;
  }
  // id tiebreaker keeps pagination stable when the sort column has ties
  return [base, { id: "asc" }];
}
