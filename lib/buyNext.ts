import "server-only";
import { prisma } from "./db";
import { num } from "./serialize";
import { buildBuyNext, type BuyNextUnit, type BuyNextReport } from "./buyNextMath";
import { buildQuarterlySeries, buildLotCurves, type RotationUnit, type RotationLot, type QuarterPoint, type LotCurve } from "./rotationMath";

/**
 * Loads every unit that has passed through the business, once, and hands the
 * same rows to both the buying score and the rotation graphs.
 *
 * One query rather than two: the two views must agree, and re-reading is how
 * they quietly stop agreeing.
 */
async function loadUnits() {
  const pallets = await prisma.pallet.findMany({
    select: {
      id: true, palletCode: true, supplier: true, conditionGrade: true, category: true,
      totalCost: true, pickupDate: true, purchaseDate: true,
      labor: { select: { hours: true } },
      items: {
        select: {
          category: true, brand: true, ourCost: true, soldPrice: true, sellPrice: true,
          feesAmount: true, shippingCost: true, dateListed: true, dateSold: true,
          dateReturned: true, isDud: true, status: true,
          orderRecord: { select: { shippingPaid: true, items: { select: { id: true } } } },
        },
      },
    },
  });

  const units: BuyNextUnit[] = [];
  const rotation: RotationUnit[] = [];
  const lots: RotationLot[] = [];

  for (const p of pallets) {
    const receivedAt = p.pickupDate ?? p.purchaseDate;
    const totalHours = p.labor.reduce((s, l) => s + Number(l.hours), 0);
    // Labour is logged per lot, so spread it across the lot's units to make it
    // comparable across segments of different sizes.
    const perUnitHours = p.items.length > 0 ? totalHours / p.items.length : 0;

    lots.push({ id: p.id, code: p.palletCode, cost: num(p.totalCost) ?? 0, receivedAt });

    for (const i of p.items) {
      // The buyer's postage is charged per ORDER, so give each unit on that
      // order an equal share rather than crediting the whole thing to one.
      const orderUnits = i.orderRecord?.items.length ?? 1;
      const collected = (num(i.orderRecord?.shippingPaid ?? null) ?? 0) / Math.max(1, orderUnits);

      const common = {
        cost: num(i.ourCost) ?? 0,
        salePrice: num(i.soldPrice),
        fees: num(i.feesAmount),
        shippingPaid: num(i.shippingCost),
        shippingCollected: collected,
        receivedAt,
        soldAt: i.dateSold,
        scrapped: i.status === "SCRAPPED",
        lotId: p.id,
      };

      units.push({
        ...common,
        category: i.category as string,
        brand: i.brand,
        supplier: p.supplier,
        conditionGrade: p.conditionGrade as string,
        listedAt: i.dateListed,
        isDud: i.isDud,
        returned: i.dateReturned != null,
        listPrice: num(i.sellPrice),
        hours: perUnitHours,
      });

      rotation.push(common);
    }
  }
  return { units, rotation, lots };
}

export interface RotationReport {
  quarters: QuarterPoint[];
  curves: LotCurve[];
}

export async function getBuyNext(now = new Date()): Promise<BuyNextReport> {
  const { units } = await loadUnits();
  return buildBuyNext(units, now);
}

export async function getRotation(now = new Date()): Promise<RotationReport> {
  const { rotation, lots } = await loadUnits();
  return {
    quarters: buildQuarterlySeries(rotation, now),
    curves: buildLotCurves(lots, rotation, now),
  };
}

/** Both, from a single read. */
export async function getBuyNextAndRotation(now = new Date()) {
  const { units, rotation, lots } = await loadUnits();
  return {
    buyNext: buildBuyNext(units, now),
    rotation: { quarters: buildQuarterlySeries(rotation, now), curves: buildLotCurves(lots, rotation, now) },
  };
}
