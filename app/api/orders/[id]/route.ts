import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseMoney, serverError, unauthorized } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { detectCarrier } from "@/lib/fulfillmentMath";

const FLOW = ["AWAITING_PICK", "PICKED", "PACKED", "SHIPPED", "CANCELLED"] as const;

/**
 * PATCH /api/orders/[id] — advance the pipeline or record shipping details.
 * { status?, trackingNumber?, carrier?, shippingCost?, notes? }
 *
 * Stamps the matching timestamp so the queue can show how long each stage
 * actually takes rather than only where an order is now.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) return notFound("Order not found");

    const b = await req.json().catch(() => null);
    if (!b) return badRequest("Invalid JSON body");

    const data: Record<string, unknown> = {};
    const now = new Date();

    if (typeof b.status === "string") {
      if (!(FLOW as readonly string[]).includes(b.status)) return badRequest(`Unknown status: ${b.status}`);
      data.status = b.status;
      if (b.status === "PICKED" && !order.pickedAt) data.pickedAt = now;
      if (b.status === "PACKED" && !order.packedAt) data.packedAt = now;
      if (b.status === "SHIPPED" && !order.shippedAt) data.shippedAt = now;
    }

    if (typeof b.trackingNumber === "string") {
      const tracking = b.trackingNumber.trim();
      data.trackingNumber = tracking || null;
      // Save staff picking a carrier from a list when the number says which.
      if (tracking && !b.carrier) {
        const guessed = detectCarrier(tracking);
        if (guessed) data.carrier = guessed;
      }
      // A tracking number means it went out; don't make them click twice.
      if (tracking && order.status !== "SHIPPED") {
        data.status = "SHIPPED";
        data.shippedAt = order.shippedAt ?? now;
      }
    }
    if (typeof b.carrier === "string") data.carrier = b.carrier.trim() || null;
    if (b.shippingCost !== undefined) data.shippingCost = parseMoney(b.shippingCost);
    if (typeof b.notes === "string") data.notes = b.notes.trim() || null;

    if (Object.keys(data).length === 0) return badRequest("Nothing to update");

    const shippingCost = data.shippingCost as number | null | undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({ where: { id }, data });

      // Cancelling releases the goods back to stock rather than stranding them
      // as SOLD against an order that will never ship.
      if (data.status === "CANCELLED") {
        await tx.item.updateMany({
          where: { orderRecordId: id },
          data: { status: "IN_STOCK", dateSold: null, soldPrice: null, orderRecordId: null },
        });
      }

      // Spread real postage across the order's lines so per-item P&L stays
      // honest on multi-item shipments.
      if (shippingCost != null && order.items.length > 0) {
        const per = Math.round((shippingCost / order.items.length) * 100) / 100;
        await tx.item.updateMany({ where: { orderRecordId: id }, data: { shippingCost: per } });
      }
      return o;
    });

    logActivity(user.name, "order.update", `${order.orderNumber}: ${data.status ?? "details"}`);
    return NextResponse.json({ ok: true, status: updated.status, carrier: updated.carrier });
  } catch (e) {
    return serverError(e);
  }
}

/** GET /api/orders/[id] — one order with its lines, for the packing slip. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await apiUser())) return unauthorized();
  try {
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: { select: { id: true, sku: true, name: true, storageLocation: true, soldPrice: true } } },
    });
    if (!order) return notFound("Order not found");
    return NextResponse.json({ order });
  } catch (e) {
    return serverError(e);
  }
}
