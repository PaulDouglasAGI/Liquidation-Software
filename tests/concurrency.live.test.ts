import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Concurrency regression, run against a REAL database by `npm run check:data`.
 *
 * Sequential codes (ORD-2026-001, LOT-2026-001) were handed out by reading the
 * current maximum and adding one, with a few optimistic retries. A simulated
 * trading day exposed how badly that fails once more than one thing is writing:
 * 22% of orders lost at 4 concurrent writers, 56% at 12, and half of all
 * bundles at 8 — every one a raw "Unique constraint failed" 500 thrown at
 * whoever had just recorded a real sale.
 *
 * Advisory locks fixed it. This asserts it stays fixed, because the failure is
 * invisible until two people work at once and then it is a lost sale.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const prisma = hasDb ? new PrismaClient() : (null as unknown as PrismaClient);

const MARK = "CONCURRENCY-TEST";

async function inParallel<T>(n: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
}

describe.runIf(hasDb)("sequential codes under concurrent writers", () => {
  afterAll(async () => {
    if (!hasDb) return;
    const pallets = await prisma.pallet.findMany({ where: { supplier: MARK }, select: { id: true } });
    const ids = pallets.map((p) => p.id);
    if (ids.length) {
      const items = await prisma.item.findMany({ where: { palletId: { in: ids } }, select: { id: true, orderRecordId: true, lotId: true } });
      await prisma.orderLine.deleteMany({ where: { itemId: { in: items.map((i) => i.id) } } });
      await prisma.item.deleteMany({ where: { palletId: { in: ids } } });
      await prisma.order.deleteMany({ where: { id: { in: items.map((i) => i.orderRecordId).filter(Boolean) as string[] } } });
      await prisma.lot.deleteMany({ where: { id: { in: items.map((i) => i.lotId).filter(Boolean) as string[] } } });
      await prisma.pallet.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  it("hands out unique order numbers with 12 writers at once", async () => {
    const { createOrder } = await import("@/lib/orders");
    const pallet = await prisma.pallet.create({
      data: { palletCode: `PAL-CONC-${Date.now() % 100000}`, supplier: MARK, purchaseDate: new Date(), totalCost: 100 },
    });
    const items = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        prisma.item.create({
          data: { sku: `ITM-CONC-${Date.now() % 100000}-${i}`, palletId: pallet.id, name: `Conc ${i}`, status: "LISTED", sellPrice: 10, ourCost: 1 },
        })
      )
    );

    const results = await inParallel(items.length, async (i) => {
      try {
        const o = await createOrder({ itemIds: [items[i].id], externalId: `${MARK}-${Date.now()}-${i}` });
        return o.orderNumber;
      } catch (e) {
        return `FAILED: ${(e as Error).message.split("\n").filter(Boolean).pop()?.trim()}`;
      }
    });

    const failures = results.filter((r) => r.startsWith("FAILED"));
    expect(failures, `every concurrent sale must be recorded, got: ${failures[0]}`).toEqual([]);
    // And no two orders may share a number, which is what the lock guarantees.
    expect(new Set(results).size).toBe(results.length);
  }, 120_000);

  it("hands out unique bundle codes with 8 writers at once", async () => {
    const pallet = await prisma.pallet.create({
      data: { palletCode: `PAL-CONCL-${Date.now() % 100000}`, supplier: MARK, purchaseDate: new Date(), totalCost: 100 },
    });
    const items = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        prisma.item.create({
          data: { sku: `ITM-CONCL-${Date.now() % 100000}-${i}`, palletId: pallet.id, name: `ConcLot ${i}`, status: "IN_STOCK", sellPrice: 10, ourCost: 1 },
        })
      )
    );

    // Straight at the route's transaction body via HTTP would need a session,
    // so exercise the same lock the route takes, on the same counter.
    const { lockCounter } = await import("@/lib/skus");
    const { formatCode, maxSuffix } = await import("@/lib/skuFormat");
    const prefix = `LOT-${new Date().getFullYear()}-`;

    const codes = await inParallel(8, async (i) => {
      return prisma.$transaction(async (tx) => {
        await lockCounter(tx, "lot-code");
        const existing = await tx.lot.findMany({ where: { lotCode: { startsWith: prefix } }, select: { lotCode: true } });
        const code = formatCode(prefix, maxSuffix(existing.map((l) => l.lotCode), prefix) + 1);
        await tx.lot.create({
          data: { lotCode: code, name: `${MARK} ${i}`, items: { connect: [{ id: items[i * 2].id }, { id: items[i * 2 + 1].id }] } },
        });
        return code;
      }, { timeout: 30_000 });
    });

    expect(new Set(codes).size, `bundle codes collided: ${codes.join(", ")}`).toBe(codes.length);
  }, 120_000);
});
