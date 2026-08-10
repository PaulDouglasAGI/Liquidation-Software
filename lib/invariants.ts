import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Rules the data must always obey, checked against the data itself.
 *
 * Every bug worth catching in this system has been a disagreement between two
 * tables about the same physical object: an order holding units it has no
 * lines for, a bundle marked sold whose units are back on the shelf, a unit
 * claimed by two orders at once. Endpoint testing finds those one path at a
 * time, and only on the paths you thought to try — both regressions in the
 * last pass were new code taking a path the tests were not watching.
 *
 * These assertions do not care which code wrote the row. They ask the far
 * cheaper question: whatever happened, is the warehouse still describable?
 */

export interface Violation {
  /** Stable id, so a check can be muted or tracked without matching prose. */
  rule: string;
  /** What is wrong, in terms of the business rather than the schema. */
  detail: string;
  /** The rows involved — SKUs and order numbers, not row ids. */
  subjects: string[];
  /**
   * "error" means the data contradicts itself and someone will act on the
   * wrong information. "warn" means it is odd but explicable.
   */
  severity: "error" | "warn";
}

/** Cap per rule, so one systemic fault cannot produce a million-line report. */
const MAX_SUBJECTS = 25;

const cap = (xs: string[]) =>
  xs.length > MAX_SUBJECTS ? [...xs.slice(0, MAX_SUBJECTS), `…and ${xs.length - MAX_SUBJECTS} more`] : xs;

export async function checkInvariants(db: Db = prisma): Promise<Violation[]> {
  const v: Violation[] = [];

  // ---- Orders and their contents -----------------------------------------

  const orders = await db.order.findMany({
    select: {
      orderNumber: true, status: true, shippedAt: true, trackingNumber: true,
      items: { select: { id: true, sku: true, status: true, lotId: true } },
      lines: { select: { itemId: true, sku: true } },
    },
  });

  // A unit attached to an order with no line for it is invisible on the
  // packing slip: the picker packs what the slip says and the buyer is short.
  const missingLines = orders.flatMap((o) => {
    const lined = new Set(o.lines.map((l) => l.itemId));
    return o.items.filter((i) => !lined.has(i.id)).map((i) => `${o.orderNumber}/${i.sku}`);
  });
  if (missingLines.length) {
    v.push({
      rule: "order.line-missing",
      severity: "error",
      detail: "Units are attached to an order that has no line for them — they will not appear on the packing slip",
      subjects: cap(missingLines),
    });
  }

  // An order with nothing on it cannot be picked and shows in no queue.
  const empty = orders
    .filter((o) => o.status !== "CANCELLED" && o.items.length === 0 && o.lines.length === 0)
    .map((o) => o.orderNumber);
  if (empty.length) {
    v.push({
      rule: "order.empty",
      severity: "error",
      detail: "Open orders with no units on them at all",
      subjects: cap(empty),
    });
  }

  // Shipped means gone. A unit on a shipped order that is not SOLD says the
  // goods are both posted and still on the shelf.
  const shippedNotSold = orders
    .filter((o) => o.status === "SHIPPED")
    .flatMap((o) => o.items.filter((i) => i.status !== "SOLD" && i.status !== "RETURNED")
      .map((i) => `${o.orderNumber}/${i.sku} is ${i.status}`));
  if (shippedNotSold.length) {
    v.push({
      rule: "order.shipped-not-sold",
      severity: "error",
      detail: "Units on a shipped order that are not sold — the goods are recorded as posted and in stock at once",
      subjects: cap(shippedNotSold),
    });
  }

  const shippedNoStamp = orders
    .filter((o) => o.status === "SHIPPED" && !o.shippedAt)
    .map((o) => o.orderNumber);
  if (shippedNoStamp.length) {
    v.push({
      rule: "order.shipped-no-timestamp",
      severity: "error",
      detail: "Shipped orders with no ship date — they are missing from throughput and from the day's shipped count",
      subjects: cap(shippedNoStamp),
    });
  }

  // ---- Units claimed by more than one thing -------------------------------

  // A line per (order, item) is unique in the schema, but a unit can still be
  // lined on two different orders — and usually that is correct: a unit
  // returned from a shipped order and resold keeps the old order's line, which
  // is the whole point of recording what went in the box.
  //
  // The genuine fault is a unit owed to two buyers who are BOTH still waiting.
  // Shipped and cancelled orders are settled, so only open ones count.
  const dupes = await db.$queryRaw<{ sku: string; orders: string }[]>`
    SELECT l."sku", STRING_AGG(o."orderNumber", ', ' ORDER BY o."orderNumber") AS orders
    FROM "OrderLine" l
    JOIN "Order" o ON o."id" = l."orderId"
    WHERE o."status" NOT IN ('CANCELLED', 'SHIPPED')
    GROUP BY l."sku"
    HAVING COUNT(DISTINCT l."orderId") > 1
  `;
  if (dupes.length) {
    v.push({
      rule: "item.owed-to-two-buyers",
      severity: "error",
      detail: "Units promised on more than one order that still has to ship — one of those buyers cannot be served",
      subjects: cap(dupes.map((d) => `${d.sku} on ${d.orders}`)),
    });
  }

  // ---- Bundles ------------------------------------------------------------

  const lots = await db.lot.findMany({
    select: { lotCode: true, status: true, items: { select: { sku: true, status: true } } },
  });

  // A sold bundle whose units are back on the shelf, or a live bundle whose
  // units have been sold out from under it. Either way two records disagree.
  for (const lot of lots) {
    if (lot.status === "SOLD") {
      const notSold = lot.items.filter((i) => i.status !== "SOLD" && i.status !== "RETURNED");
      if (notSold.length) {
        v.push({
          rule: "lot.sold-but-units-in-stock",
          severity: "error",
          detail: `Bundle ${lot.lotCode} is sold but holds units that are not`,
          subjects: cap(notSold.map((i) => `${i.sku} is ${i.status}`)),
        });
      }
    }
    if (lot.status === "DRAFT" || lot.status === "LISTED") {
      // Units held in an unsold bundle are spoken for and must read RESERVED,
      // or they will be offered for individual sale as well.
      const loose = lot.items.filter((i) => i.status !== "RESERVED");
      if (loose.length) {
        v.push({
          rule: "lot.unsold-units-not-reserved",
          severity: "error",
          detail: `Bundle ${lot.lotCode} is ${lot.status} but its units are not reserved`,
          subjects: cap(loose.map((i) => `${i.sku} is ${i.status}`)),
        });
      }
    }
  }

  // ---- Item state ---------------------------------------------------------

  // SOLD with no sale attached to it: revenue that belongs to nobody, and a
  // unit that no queue will ever ask anyone to ship.
  const soldOrphans = await db.item.findMany({
    where: { status: "SOLD", orderRecordId: null, lotId: null },
    select: { sku: true },
  });
  if (soldOrphans.length) {
    v.push({
      rule: "item.sold-without-order",
      severity: "error",
      detail: "Units marked sold that belong to no order and no bundle — nothing will tell anyone to ship them",
      subjects: cap(soldOrphans.map((i) => i.sku)),
    });
  }

  const soldNoDate = await db.item.count({ where: { status: "SOLD", dateSold: null } });
  if (soldNoDate > 0) {
    v.push({
      rule: "item.sold-without-date",
      severity: "error",
      detail: `${soldNoDate} sold unit(s) with no sale date — they fall out of every month's P&L`,
      subjects: [],
    });
  }

  // Reserved by nothing. RESERVED means promised; with no bundle and no order
  // behind it the unit is simply withheld from sale for no reason.
  const strandedReserved = await db.item.findMany({
    where: { status: "RESERVED", lotId: null, orderRecordId: null },
    select: { sku: true },
  });
  if (strandedReserved.length) {
    v.push({
      rule: "item.reserved-by-nothing",
      severity: "warn",
      detail: "Units held as reserved with no bundle or order behind them — withheld from sale for no recorded reason",
      subjects: cap(strandedReserved.map((i) => i.sku)),
    });
  }

  // ---- Adverts vs stock ---------------------------------------------------

  // The expensive one: an advert still live for a unit that is gone. A second
  // buyer pays for stock that is already in someone else's box, and it costs
  // the refund, the return postage and a mark on the seller account.
  const liveOnDeadStock = await db.listing.findMany({
    where: { endedAt: null, item: { status: { in: ["SOLD", "SCRAPPED"] } } },
    select: { channel: true, needsTakedownAt: true, item: { select: { sku: true, status: true } } },
  });
  if (liveOnDeadStock.length) {
    const queued = liveOnDeadStock.filter((l) => l.needsTakedownAt != null);
    const unqueued = liveOnDeadStock.filter((l) => l.needsTakedownAt == null);
    if (unqueued.length) {
      v.push({
        rule: "listing.live-on-sold-stock",
        severity: "error",
        detail: "Adverts still live for stock that has sold or been scrapped, and NOT queued for takedown — nothing will tell anyone to pull them",
        subjects: cap(unqueued.map((l) => `${l.item.sku} on ${l.channel} (${l.item.status})`)),
      });
    }
    if (queued.length) {
      v.push({
        rule: "listing.awaiting-takedown",
        severity: "warn",
        detail: "Adverts queued for takedown but not yet pulled down — a second buyer can still purchase these",
        subjects: cap(queued.map((l) => `${l.item.sku} on ${l.channel}`)),
      });
    }
  }

  // ---- Money --------------------------------------------------------------

  // Unit costs must add back up to what the pallet cost. Sold units keep the
  // cost they were booked at, so a pallet with sales can legitimately drift;
  // one where nothing has sold cannot.
  const pallets = await db.pallet.findMany({
    select: { palletCode: true, totalCost: true, items: { select: { ourCost: true, status: true } } },
  });
  const drifted: string[] = [];
  for (const p of pallets) {
    if (p.items.length === 0) continue;
    if (p.items.some((i) => i.status === "SOLD")) continue; // booked history, not drift
    const allocated = p.items.reduce((s, i) => s + Number(i.ourCost), 0);
    const paid = Number(p.totalCost);
    // A cent of slack for the shares themselves; anything more is a real gap.
    if (Math.abs(allocated - paid) > 0.01) {
      drifted.push(`${p.palletCode}: paid $${paid.toFixed(2)}, allocated $${allocated.toFixed(2)}`);
    }
  }
  if (drifted.length) {
    v.push({
      rule: "pallet.cost-not-reconciled",
      severity: "error",
      detail: "Unit costs do not add up to what was paid for the pallet — COGS is wrong on every unit",
      subjects: cap(drifted),
    });
  }

  // Negative money is never a real figure anywhere in this system.
  const negatives = await db.item.findMany({
    where: { OR: [{ soldPrice: { lt: 0 } }, { ourCost: { lt: 0 } }, { sellPrice: { lt: 0 } }, { feesAmount: { lt: 0 } }] },
    select: { sku: true },
  });
  if (negatives.length) {
    v.push({
      rule: "item.negative-money",
      severity: "error",
      detail: "Units carrying a negative price, cost or fee",
      subjects: cap(negatives.map((i) => i.sku)),
    });
  }

  return v;
}
