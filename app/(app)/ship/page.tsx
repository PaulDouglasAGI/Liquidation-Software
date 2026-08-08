import { requireUser } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { num } from "@/lib/serialize";
import ShipQueue from "@/components/ShipQueue";

export const dynamic = "force-dynamic";

// Enough for a busy day on one screen; anything beyond is reported, never hidden.
const PAGE_SIZE = 300;

export default async function ShipPage() {
  await requireUser();

  const OPEN: Prisma.OrderWhereInput = { status: { notIn: ["SHIPPED", "CANCELLED"] } };
  // Count separately from the page: the headline used to report however many
  // rows happened to load, so 550 open orders read as 300 and the team went
  // home with 250 unshipped — 150 of them already overdue — and no indication.
  const [totalOpen, overdueOpen] = await Promise.all([
    prisma.order.count({ where: OPEN }),
    prisma.order.count({ where: { ...OPEN, shipByDate: { lt: new Date() } } }),
  ]);

  const orders = await prisma.order.findMany({
    where: OPEN,
    include: {
      items: {
        select: { id: true, sku: true, name: true, storageLocation: true, soldPrice: true },
        orderBy: { sku: "asc" },
      },
    },
    orderBy: [{ shipByDate: "asc" }, { createdAt: "asc" }],
    take: PAGE_SIZE,
  });

  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
  const shippedToday = await prisma.order.count({ where: { shippedAt: { gte: startOfToday } } });

  // Today's shipments and anything cancelled recently, so a mistake stays
  // reachable. Both used to drop straight out of every screen the moment they
  // were made: the order was gone, the goods were still on the shelf, and
  // there was nowhere left to put it right.
  const recent = await prisma.order.findMany({
    where: {
      OR: [
        { status: "SHIPPED", shippedAt: { gte: startOfToday } },
        { status: "CANCELLED", updatedAt: { gte: startOfToday } },
      ],
    },
    select: {
      id: true, orderNumber: true, status: true, buyerName: true,
      carrier: true, trackingNumber: true, shippedAt: true,
      items: { select: { sku: true }, orderBy: { sku: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return (
    <ShipQueue
      shippedToday={shippedToday}
      totalOpen={totalOpen}
      overdueOpen={overdueOpen}
      recent={recent.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        buyerName: o.buyerName,
        carrier: o.carrier,
        trackingNumber: o.trackingNumber,
        shippedAt: o.shippedAt?.toISOString() ?? null,
        skus: o.items.map((i) => i.sku),
      }))}
      orders={orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        externalId: o.externalId,
        platform: o.platform,
        buyerName: o.buyerName,
        status: o.status,
        soldAt: o.soldAt?.toISOString() ?? null,
        shipByDate: o.shipByDate?.toISOString() ?? null,
        carrier: o.carrier,
        trackingNumber: o.trackingNumber,
        shippingPaid: num(o.shippingPaid),
        items: o.items.map((i) => ({
          id: i.id,
          sku: i.sku,
          name: i.name,
          storageLocation: i.storageLocation,
          soldPrice: num(i.soldPrice),
        })),
      }))}
    />
  );
}
