import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseMoney, serverError, unauthorized } from "@/lib/api";
import { createOrder } from "@/lib/orders";
import { logActivity } from "@/lib/activity";

/** GET /api/orders?status=AWAITING_PICK — the fulfillment queue. */
export async function GET(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const status = req.nextUrl.searchParams.get("status");
    const orders = await prisma.order.findMany({
      where: status ? { status: status as never } : { status: { notIn: ["SHIPPED", "CANCELLED"] } },
      include: { items: { select: { id: true, sku: true, name: true, storageLocation: true } } },
      orderBy: [{ shipByDate: "asc" }, { createdAt: "asc" }],
      take: 500,
    });
    return NextResponse.json({ orders });
  } catch (e) {
    return serverError(e);
  }
}

/**
 * POST /api/orders — record a sale that needs shipping.
 * { itemIds: string[], buyerName?, externalId?, platform?, shipTo?, shippingPaid? }
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const itemIds: string[] = Array.isArray(b?.itemIds) ? b.itemIds.filter((x: unknown) => typeof x === "string") : [];
    if (itemIds.length === 0) return badRequest("Select at least one item");

    const order = await createOrder({
      itemIds,
      externalId: typeof b.externalId === "string" ? b.externalId.trim() || null : null,
      platform: typeof b.platform === "string" ? b.platform : null,
      buyerName: typeof b.buyerName === "string" ? b.buyerName.trim() || null : null,
      shipTo: b.shipTo ?? undefined,
      shippingPaid: parseMoney(b.shippingPaid),
      notes: typeof b.notes === "string" ? b.notes.trim() || null : null,
    });
    logActivity(user.name, "order.create", `${order.orderNumber} — ${itemIds.length} item(s)`);
    return NextResponse.json({ id: order.id, orderNumber: order.orderNumber });
  } catch (e) {
    return serverError(e);
  }
}
