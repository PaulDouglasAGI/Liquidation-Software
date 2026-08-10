import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { formatCode, maxSuffix } from "./skuFormat";
import { isUniqueViolation, lockCounter } from "./skus";
import { shipByFrom, DEFAULT_HANDLING_DAYS } from "./fulfillmentMath";
import { estimateFees } from "./fees";
import { getFeeRates } from "./settings";
import { takeDownOtherListings, type Channel } from "./listings";

type Db = Prisma.TransactionClient | typeof prisma;

/** Raised when items cannot be sold — caller turns it into a 400. */
export class OrderConflict extends Error {}

/** A unit is available to sell when it is physically on the shelf. */
export function isOnShelf(status: string): boolean {
  return status === "IN_STOCK" || status === "LISTED";
}

/**
 * Records what went in the box, copying sku/name/price rather than joining, so
 * a later rename or re-price cannot rewrite a past shipment.
 *
 * Upserts: re-adding a unit that is already on the order is a double-click,
 * not a second copy of the same physical thing.
 */
export async function addOrderLine(
  db: Db,
  orderId: string,
  item: { id: string; sku: string; name: string },
  // Decimal as well as number: fees may come straight off the item, where
  // Prisma hands back a Decimal rather than a plain number.
  soldPrice: Prisma.Decimal | number | null,
  feesAmount: Prisma.Decimal | number | null
) {
  await db.orderLine.upsert({
    where: { orderId_itemId: { orderId, itemId: item.id } },
    create: { orderId, itemId: item.id, sku: item.sku, name: item.name, soldPrice, feesAmount },
    update: { sku: item.sku, name: item.name, soldPrice, feesAmount },
  });
}

/**
 * Next internal order number for the year, e.g. ORD-2026-001.
 *
 * Takes the counter lock first. Read-max-then-write with a few optimistic
 * retries looked fine with one person clicking, but a simulated day of two
 * staff plus marketplace sync failed 22% of orders at 4 concurrent writers and
 * 56% at 12 — each a raw unique-constraint 500 on a sale that had really
 * happened. The lock releases with the transaction, so nothing can leak it.
 */
export async function nextOrderNumber(db: Db = prisma): Promise<string> {
  await lockCounter(db as Prisma.TransactionClient, "order-number");
  const prefix = `ORD-${new Date().getFullYear()}-`;
  const existing = await db.order.findMany({
    where: { orderNumber: { startsWith: prefix } },
    select: { orderNumber: true },
  });
  return formatCode(prefix, maxSuffix(existing.map((o) => o.orderNumber), prefix) + 1);
}

export interface NewOrderInput {
  itemIds: string[];
  externalId?: string | null;
  platform?: string | null;
  buyerName?: string | null;
  shipTo?: {
    name?: string | null; line1?: string | null; line2?: string | null;
    city?: string | null; state?: string | null; postal?: string | null; country?: string | null;
  };
  soldAt?: Date | null;
  shippingPaid?: number | null;
  handlingDays?: number;
  notes?: string | null;
  /** Sale price per item id; falls back to the item's asking price. */
  soldPrices?: Record<string, number>;
}

/**
 * Creates a fulfillment record and attaches its items, marking them SOLD with
 * a price, platform, and estimated fees so the sale lands in P&L correctly.
 *
 * Refuses items that are already sold, already on another open order, or held
 * in a lot — selling the same unit twice leaves the first buyer's order as a
 * phantom with no lines.
 */
export async function createOrder(input: NewOrderInput) {
  const rates = await getFeeRates();

  for (let attempt = 0; ; attempt++) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const soldAt = input.soldAt ?? new Date();
        const platform = input.platform ?? null;

        // Re-read inside the transaction: validating outside it would let two
        // concurrent requests both pass the check and both claim the item.
        const items = await tx.item.findMany({ where: { id: { in: input.itemIds } } });
        if (items.length !== input.itemIds.length) {
          throw new OrderConflict("Some selected items no longer exist");
        }
        // A unit is unavailable while it is SOLD, or while it still sits on an
        // order it has not physically come back from.
        //
        // The link to a past order is NOT itself a block. Treating it as one
        // made every restocked return permanently unsellable — the unit showed
        // IN_STOCK on the shelf but every sale failed with "already sold".
        // Being back on the shelf (IN_STOCK/LISTED) is what frees it.
        //
        // Reselling moves the LINK to the new order; the original order keeps
        // its OrderLine, so what it shipped still reads correctly.
        const taken = items.filter((i) => i.status === "SOLD" || (i.orderRecordId && !isOnShelf(i.status)));
        if (taken.length) {
          throw new OrderConflict(
            `Already sold or on another order: ${taken.map((i) => i.sku).join(", ")}`
          );
        }
        const lotted = items.filter((i) => i.lotId);
        if (lotted.length) {
          throw new OrderConflict(
            `Reserved in a lot — sell the lot instead: ${lotted.map((i) => i.sku).join(", ")}`
          );
        }

        const order = await tx.order.create({
          data: {
            orderNumber: await nextOrderNumber(tx),
            externalId: input.externalId ?? null,
            platform: (platform as never) ?? null,
            buyerName: input.buyerName ?? null,
            shipToName: input.shipTo?.name ?? null,
            shipToLine1: input.shipTo?.line1 ?? null,
            shipToLine2: input.shipTo?.line2 ?? null,
            shipToCity: input.shipTo?.city ?? null,
            shipToState: input.shipTo?.state ?? null,
            shipToPostal: input.shipTo?.postal ?? null,
            shipToCountry: input.shipTo?.country ?? null,
            soldAt,
            shipByDate: shipByFrom(soldAt, input.handlingDays ?? DEFAULT_HANDLING_DAYS),
            shippingPaid: input.shippingPaid ?? null,
            notes: input.notes ?? null,
          },
        });

        // Per item, so each carries its own price and fee. A blanket
        // updateMany would book every line at $0 revenue against full COGS.
        for (const item of items) {
          const soldPrice =
            input.soldPrices?.[item.id] ?? item.soldPrice?.toNumber() ?? item.sellPrice?.toNumber() ?? null;
          const fees = item.feesAmount ?? estimateFees(soldPrice, platform ?? item.platform, rates);
          await tx.item.update({
            where: { id: item.id },
            data: {
              orderRecordId: order.id,
              status: "SOLD",
              dateSold: soldAt,
              soldPrice,
              platform: (platform as never) ?? item.platform,
              feesAmount: fees,
            },
          });
          await addOrderLine(tx, order.id, item, soldPrice, fees);
        }
        return { order, itemIds: items.map((i) => i.id) };
      }, { timeout: 30_000 });

      // Every other advert for these units has to come down, now. Deliberately
      // outside the transaction: it calls a marketplace API, and a slow or
      // broken eBay must never roll back a sale that really happened. Anything
      // that fails stays in the takedown queue for a person.
      await takeDownOtherListings(created.itemIds, (input.platform as Channel) ?? null).catch(() => []);
      return created.order;
    } catch (e) {
      if (e instanceof OrderConflict) throw e;
      if (isUniqueViolation(e) && attempt < 3) continue;
      throw e;
    }
  }
}

/**
 * Adds an already-sold unit to an order that exists, link and line together.
 *
 * The link alone is not enough: a multi-item marketplace order collapses onto
 * one order here, and every unit after the first arrives through this path. A
 * line-less unit is invisible on the packing slip, so the picker packs one
 * item and the buyer is short the rest of their order.
 */
async function attachExistingItem(orderId: string, itemId: string, soldPrice?: number | null) {
  await prisma.$transaction(async (tx) => {
    const item = await tx.item.update({
      where: { id: itemId },
      data: { orderRecordId: orderId },
    });
    await addOrderLine(tx, orderId, item, soldPrice ?? item.soldPrice, item.feesAmount);
  });
}

/**
 * Finds the order for a marketplace order id, or creates one and attaches the
 * item. Lets repeated syncs of a multi-item order collapse into one shipment
 * instead of one order per line.
 *
 * A CANCELLED order is never reused: attaching to it would hide the sale from
 * the ship queue forever. Sync starts a fresh order instead.
 */
export async function attachItemToExternalOrder(
  itemId: string,
  externalId: string,
  platform: string,
  soldAt: Date,
  soldPrice?: number | null,
  buyerName?: string | null
) {
  const existing = await prisma.order.findFirst({
    where: { externalId, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) {
    await attachExistingItem(existing.id, itemId, soldPrice);
    return existing;
  }
  try {
    return await createOrder({
      itemIds: [itemId],
      externalId,
      platform,
      soldAt,
      buyerName,
      soldPrices: soldPrice != null ? { [itemId]: soldPrice } : undefined,
    });
  } catch (e) {
    // A concurrent sync may have created the order between our read and write.
    if (isUniqueViolation(e) || e instanceof OrderConflict) {
      const raced = await prisma.order.findFirst({
        where: { externalId, status: { not: "CANCELLED" } },
        orderBy: { createdAt: "asc" },
      });
      if (raced) {
        await attachExistingItem(raced.id, itemId, soldPrice);
        return raced;
      }
    }
    throw e;
  }
}
