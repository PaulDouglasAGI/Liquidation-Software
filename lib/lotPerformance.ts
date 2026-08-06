import "server-only";
import { prisma } from "./db";
import { num } from "./serialize";
import {
  aggregate,
  analyzeLot,
  type AggregateInsights,
  type LotInput,
  type LotPerformance,
} from "./lotPerformanceMath";

/**
 * Pulls the rows the five metrics need and hands them to the pure maths.
 *
 * Deliberately selects no per-item cost field: the module computes profit
 * against the lot's own total and nothing else. See lib/lotPerformanceMath.ts.
 */
const lotSelect = {
  id: true,
  palletCode: true,
  supplier: true,
  sourceLotId: true,
  category: true,
  conditionGrade: true,
  status: true,
  totalCost: true,
  fees: true,
  pickupDate: true,
  purchaseDate: true,
  preBidEstimatedRecovery: true,
  manifestUnitCount: true,
  actualUnitCount: true,
  manifestRetailTotal: true,
  items: {
    select: {
      category: true,
      valueClass: true,
      isDud: true,
      dudReason: true,
      dateListed: true,
      dateSold: true,
      soldPrice: true,
    },
  },
  labor: {
    select: { hours: true, activity: true, userName: true, date: true },
  },
} as const;

type LotRow = Awaited<ReturnType<typeof fetchLots>>[number];

function fetchLots(where: object = {}, take = 500) {
  return prisma.pallet.findMany({
    where,
    select: lotSelect,
    orderBy: [{ pickupDate: "desc" }, { purchaseDate: "desc" }],
    take,
  });
}

function toInput(p: LotRow): LotInput {
  return {
    id: p.id,
    code: p.palletCode,
    source: p.supplier,
    sourceLotId: p.sourceLotId,
    category: p.category as string,
    conditionGrade: p.conditionGrade as LotInput["conditionGrade"],
    status: p.status as string,
    totalCost: p.totalCost.toNumber(),
    fees: p.fees.toNumber(),
    // Lots recorded before pickup dates existed fall back to the purchase
    // date, which is the only arrival date we have for them.
    pickupDate: p.pickupDate ?? p.purchaseDate,
    preBidEstimatedRecovery: num(p.preBidEstimatedRecovery),
    manifestUnitCount: p.manifestUnitCount,
    actualUnitCount: p.actualUnitCount,
    manifestRetailTotal: num(p.manifestRetailTotal),
    units: p.items.map((i) => ({
      category: i.category as string,
      valueClass: i.valueClass as LotInput["units"][number]["valueClass"],
      isDud: i.isDud,
      dudReason: i.dudReason as LotInput["units"][number]["dudReason"],
      listedDate: i.dateListed,
      soldDate: i.dateSold,
      salePrice: num(i.soldPrice),
    })),
    labor: p.labor.map((l) => ({
      hours: l.hours.toNumber(),
      activity: l.activity as LotInput["labor"][number]["activity"],
      userName: l.userName,
      date: l.date,
    })),
  };
}

/** Every lot, scored. Drives the Lot Performance list. */
export async function lotPerformance(take = 500): Promise<LotPerformance[]> {
  const lots = await fetchLots({}, take);
  return lots.map((p) => analyzeLot(toInput(p)));
}

/** One lot in full, or null if the id is unknown. */
export async function lotPerformanceById(id: string): Promise<{
  performance: LotPerformance;
  labor: {
    id: string;
    userName: string;
    date: string;
    hours: number;
    activity: string;
    notes: string | null;
  }[];
} | null> {
  const [lot, labor] = await Promise.all([
    prisma.pallet.findUnique({ where: { id }, select: lotSelect }),
    prisma.laborEntry.findMany({
      where: { palletId: id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { id: true, userName: true, date: true, hours: true, activity: true, notes: true },
    }),
  ]);
  if (!lot) return null;
  return {
    performance: analyzeLot(toInput(lot)),
    labor: labor.map((l) => ({
      id: l.id,
      userName: l.userName,
      date: l.date.toISOString(),
      hours: l.hours.toNumber(),
      activity: l.activity as string,
      notes: l.notes,
    })),
  };
}

/** The buying-decision view: profit per hour by category and condition grade. */
export async function lotInsights(take = 500): Promise<AggregateInsights> {
  const lots = await fetchLots({}, take);
  return aggregate(lots.map(toInput));
}

/** Lots the quick "log hours" sheet can be pointed at, newest first. */
export async function laborTargets(take = 60) {
  const lots = await prisma.pallet.findMany({
    where: { status: { not: "CLOSED" } },
    select: { id: true, palletCode: true, supplier: true, status: true },
    orderBy: [{ pickupDate: "desc" }, { purchaseDate: "desc" }],
    take,
  });
  return lots.map((l) => ({
    id: l.id,
    code: l.palletCode,
    source: l.supplier,
    status: l.status as string,
  }));
}

/** Hours per person across the business, for costing a part-time runner. */
export async function hoursByUser(since?: Date) {
  const rows = await prisma.laborEntry.groupBy({
    by: ["userName"],
    where: since ? { date: { gte: since } } : undefined,
    _sum: { hours: true },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({
      userName: r.userName,
      hours: r._sum.hours?.toNumber() ?? 0,
      entries: r._count._all,
    }))
    .sort((a, b) => b.hours - a.hours);
}
