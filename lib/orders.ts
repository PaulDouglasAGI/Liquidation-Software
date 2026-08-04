import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { formatCode, maxSuffix } from "./skuFormat";
import { isUniqueViolation } from "./skus";
import { shipByFrom, DEFAULT_HANDLING_DAYS } from "./fulfillmentMath";
import { estimateFees } from "./fees";
import { getFeeRates } from "./settings";

type Db = Prisma.TransactionClient | typeof prisma;

/** Raised when items cannot be sold — caller turns it into a 400. */
export class OrderConflict extends Error {}

/** Next internal order number for the year, e.g. ORD-2026-001. */
export async function nextOrderNumber(db: Db = prisma): Promise<string> {
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
      return await prisma.$transaction(async (tx) => {
        const soldAt = input.soldAt ?? new Date();
        const platform = input.platform ?? null;

        // Re-read inside the transaction: validating outside it would let two
        // concurrent requests both pass the check and both claim the item.
        const items = await tx.item.findMany({ where: { id: { in: input.itemIds } } });
        if (items.length !== input.itemIds.length) {
          throw new OrderConflict("Some selected items no longer exist");
        }
        const taken = items.filter((i) => i.orderRecordId || i.status === "SOLD");
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
          await tx.item.update({
            where: { id: item.id },
            data: {
              orderRecordId: order.id,
              status: "SOLD",
              dateSold: soldAt,
              soldPrice,
              platform: (platform as never) ?? item.platform,
              feesAmount: item.feesAmount ?? estimateFees(soldPrice, platform ?? item.platform, rates),
            },
          });
        }
        return order;
      }, { timeout: 30_000 });
    } catch (e) {
      if (e instanceof OrderConflict) throw e;
      if (isUniqueViolation(e) && attempt < 3) continue;
      throw e;
    }
  }
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
    await prisma.item.update({
      where: { id: itemId },
      data: { orderRecordId: existing.id },
    });
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
        await prisma.item.update({ where: { id: itemId }, data: { orderRecordId: raced.id } });
        return raced;
      }
    }
    throw e;
  }
}
