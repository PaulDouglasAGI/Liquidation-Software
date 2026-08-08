import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseMoney, serverError, unauthorized } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { detectCarrier, splitEvenly } from "@/lib/fulfillmentMath";
import { recalcPalletStatus } from "@/lib/pallets";
import { estimateFees } from "@/lib/fees";
import { getFeeRates } from "@/lib/settings";
import { ORDER_STATUSES, type OrderStatusValue } from "@/lib/constants";
import { canMove, refusalReason } from "@/lib/orderStatus";

/**
 * PATCH /api/orders/[id] — advance the pipeline or record shipping details.
 * { status?, trackingNumber?, carrier?, shippingCost?, notes? }
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

    const current = order.status as OrderStatusValue;
    const data: Record<string, unknown> = {};
    const now = new Date();

    // A tracking number on a packed order means it went out; treat it as a
    // request to ship so staff don't have to click twice.
    //
    // Only from PACKED, though. The tracking box sits on every row of the
    // queue, so pasting into the wrong one used to ship an order that had not
    // been picked or packed — one keystroke, no confirmation, straight past
    // both checkpoints. On an unpacked order the number is now just recorded,
    // and shipping stays an explicit act.
    const tracking = typeof b.trackingNumber === "string" ? b.trackingNumber.trim() : null;
    const wantsShip = Boolean(tracking) && current === "PACKED";
    const wantedStatus: string | null =
      typeof b.status === "string" ? b.status : wantsShip ? "SHIPPED" : null;

    if (wantedStatus) {
      if (!(ORDER_STATUSES as readonly string[]).includes(wantedStatus)) {
        return badRequest(`Unknown status: ${wantedStatus}`);
      }
      const next = wantedStatus as OrderStatusValue;
      if (next !== current) {
        if (!canMove(current, next)) return badRequest(refusalReason(current, next));
        data.status = next;
        if (next === "PICKED" && !order.pickedAt) data.pickedAt = now;
        if (next === "PACKED" && !order.packedAt) data.packedAt = now;
        if (next === "SHIPPED" && !order.shippedAt) data.shippedAt = now;
        // Undoing a step clears its timestamp, so "shipped today" and the
        // pick/pack timings count what actually happened rather than what was
        // briefly mis-clicked.
        if (current === "SHIPPED" && next !== "SHIPPED") data.shippedAt = null;
        if (next === "PICKED" || next === "AWAITING_PICK") data.packedAt = null;
        if (next === "AWAITING_PICK") data.pickedAt = null;
      }
    }

    if (tracking !== null) {
      data.trackingNumber = tracking || null;
      if (tracking && !b.carrier) {
        const guessed = detectCarrier(tracking);
        if (guessed) data.carrier = guessed;
      }
    }
    if (typeof b.carrier === "string") data.carrier = b.carrier.trim() || null;
    if (b.shippingCost !== undefined) data.shippingCost = parseMoney(b.shippingCost);
    if (typeof b.notes === "string") data.notes = b.notes.trim() || null;

    if (Object.keys(data).length === 0) return badRequest("Nothing to update");

    const shippingCost = data.shippingCost as number | null | undefined;
    const cancelling = data.status === "CANCELLED";
    const reopening = current === "CANCELLED" && data.status != null;

    // Reopening has to re-claim the goods, and someone may have sold them in
    // the meantime. Say which ones rather than silently double-selling.
    if (reopening) {
      const stolen = order.items.filter((i) => i.status === "SOLD" || i.lotId);
      if (stolen.length) {
        return badRequest(
          `Cannot reopen — these have since been sold or lotted elsewhere: ${stolen
            .map((i) => i.sku)
            .join(", ")}`
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({ where: { id }, data });

      if (reopening) {
        // Put the sale back on every line exactly as cancelling took it off.
        const rates = await getFeeRates();
        for (const item of order.items) {
          const soldPrice = item.sellPrice?.toNumber() ?? null;
          await tx.item.update({
            where: { id: item.id },
            data: {
              status: "SOLD",
              dateSold: o.soldAt ?? now,
              soldPrice,
              feesAmount: estimateFees(soldPrice, o.platform ?? item.platform, rates),
            },
          });
        }
      } else if (cancelling) {
        // Release the goods AND scrub the dead sale. Leaving feesAmount or
        // shippingCost behind would charge this cancelled order's costs
        // against whatever the item sells for next.
        //
        // orderRecordId deliberately survives: it is what lets the order be
        // reopened later, and availability is decided by shelf status, not by
        // the link. Nulling it left a cancelled order with no lines at all,
        // so an accidental cancel could never be undone.
        const listed = order.items.filter((i) => i.dateListed).map((i) => i.id);
        const unlisted = order.items.filter((i) => !i.dateListed).map((i) => i.id);
        const clear = {
          orderId: null, dateSold: null,
          soldPrice: null, feesAmount: null, shippingCost: null,
        };
        // Restore what each item actually was before the sale — blanket
        // LISTED would invent marketplace listings that never existed.
        if (listed.length) {
          await tx.item.updateMany({ where: { id: { in: listed } }, data: { ...clear, status: "LISTED" } });
        }
        if (unlisted.length) {
          await tx.item.updateMany({ where: { id: { in: unlisted } }, data: { ...clear, status: "IN_STOCK" } });
        }
      } else if (shippingCost != null && order.items.length > 0) {
        // Allocate to the cent so per-item shipping sums exactly to what we
        // paid; a flat divide loses the remainder.
        const shares = splitEvenly(shippingCost, order.items.length);
        for (const [idx, item] of order.items.entries()) {
          await tx.item.update({ where: { id: item.id }, data: { shippingCost: shares[idx] } });
        }
      }

      for (const palletId of new Set(order.items.map((i) => i.palletId))) {
        await recalcPalletStatus(palletId, tx);
      }
      return o;
    }, { timeout: 30_000 });

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
