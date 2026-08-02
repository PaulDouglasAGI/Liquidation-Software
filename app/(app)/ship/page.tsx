import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { num } from "@/lib/serialize";
import ShipQueue from "@/components/ShipQueue";

export const dynamic = "force-dynamic";

export default async function ShipPage() {
  await requireUser();

  const orders = await prisma.order.findMany({
    where: { status: { notIn: ["SHIPPED", "CANCELLED"] } },
    include: {
      items: {
        select: { id: true, sku: true, name: true, storageLocation: true, soldPrice: true },
        orderBy: { sku: "asc" },
      },
    },
    orderBy: [{ shipByDate: "asc" }, { createdAt: "asc" }],
    take: 300,
  });

  const shippedToday = await prisma.order.count({
    where: { shippedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
  });

  return (
    <ShipQueue
      shippedToday={shippedToday}
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
