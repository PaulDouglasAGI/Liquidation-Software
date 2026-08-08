import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseMoney, serverError, unauthorized } from "@/lib/api";
import { createOrder, OrderConflict } from "@/lib/orders";
import { ORDER_STATUSES } from "@/lib/constants";
import { logActivity } from "@/lib/activity";

/** GET /api/orders?status=AWAITING_PICK — the fulfillment queue. */
export async function GET(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const raw = req.nextUrl.searchParams.get("status");
    // Unvalidated enums reach Prisma as a bad value and 500 with the query
    // shape in the message.
    const status = raw && (ORDER_STATUSES as readonly string[]).includes(raw) ? raw : null;
    if (raw && !status) return badRequest(`Unknown status: ${raw}`);
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

    // externalId is unique, and a cancelled order keeps its marketplace id, so
    // re-entering a sale after a mistaken cancel used to 500 with a raw
    // constraint dump. Point at the order that holds it instead.
    const externalId = typeof b.externalId === "string" ? b.externalId.trim() || null : null;
    if (externalId) {
      const clash = await prisma.order.findUnique({
        where: { externalId },
        select: { orderNumber: true, status: true },
      });
      if (clash) {
        return badRequest(
          clash.status === "CANCELLED"
            ? `Order ${externalId} is on ${clash.orderNumber}, which was cancelled. Reopen it instead of re-entering the sale.`
            : `Order ${externalId} is already recorded as ${clash.orderNumber}.`
        );
      }
    }

    const order = await createOrder({
      itemIds,
      externalId,
      platform: typeof b.platform === "string" ? b.platform : null,
      buyerName: typeof b.buyerName === "string" ? b.buyerName.trim() || null : null,
      shipTo: b.shipTo ?? undefined,
      shippingPaid: parseMoney(b.shippingPaid),
      notes: typeof b.notes === "string" ? b.notes.trim() || null : null,
    });
    logActivity(user.name, "order.create", `${order.orderNumber} — ${itemIds.length} item(s)`);
    return NextResponse.json({ id: order.id, orderNumber: order.orderNumber });
  } catch (e) {
    // Double-sale / already-lotted is the caller's mistake, not a server fault.
    if (e instanceof OrderConflict) return badRequest(e.message);
    return serverError(e);
  }
}
