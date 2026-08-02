import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { formatCode, maxSuffix } from "./skuFormat";
import { isUniqueViolation } from "./skus";
import { shipByFrom, DEFAULT_HANDLING_DAYS } from "./fulfillmentMath";

type Db = Prisma.TransactionClient | typeof prisma;

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
}

/**
 * Creates a fulfillment record and attaches its items, marking them SOLD.
 * Retries the whole transaction on an order-number race.
 */
export async function createOrder(input: NewOrderInput) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const soldAt = input.soldAt ?? new Date();
        const order = await tx.order.create({
          data: {
            orderNumber: await nextOrderNumber(tx),
            externalId: input.externalId ?? null,
            platform: (input.platform as never) ?? null,
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
        if (input.itemIds.length) {
          await tx.item.updateMany({
            where: { id: { in: input.itemIds } },
            data: { orderRecordId: order.id, status: "SOLD", dateSold: soldAt },
          });
        }
        return order;
      }, { timeout: 20_000 });
    } catch (e) {
      if (isUniqueViolation(e) && attempt < 3) continue;
      throw e;
    }
  }
}

/**
 * Finds the order for a marketplace order id, or creates one and attaches the
 * item. Lets repeated syncs of a multi-item order collapse into one shipment
 * instead of one order per line.
 */
export async function attachItemToExternalOrder(
  itemId: string,
  externalId: string,
  platform: string,
  soldAt: Date,
  buyerName?: string | null
) {
  const existing = await prisma.order.findFirst({ where: { externalId } });
  if (existing) {
    await prisma.item.update({
      where: { id: itemId },
      data: { orderRecordId: existing.id },
    });
    return existing;
  }
  return createOrder({ itemIds: [itemId], externalId, platform, soldAt, buyerName });
}
