import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseDate, parseMoney, serverError, unauthorized } from "@/lib/api";
import { recalcPalletStatus } from "@/lib/pallets";
import { CATEGORIES, CONDITIONS, ITEM_STATUSES, PLATFORMS } from "@/lib/constants";
import { toPlain } from "@/lib/serialize";
import { logActivity } from "@/lib/activity";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!(await apiUser())) return unauthorized();
  const { id } = await params;
  const item = await prisma.item.findUnique({ where: { id }, include: { pallet: true } });
  if (!item) return notFound("Item not found");
  return NextResponse.json(toPlain(item));
}

const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const b = await req.json().catch(() => null);
    if (!b) return badRequest("Invalid JSON body");
    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) return notFound("Item not found");

    // Optimistic concurrency: the full-form editor sends the updatedAt it
    // loaded with. A mismatch means the item changed elsewhere (another tab,
    // a teammate, a webhook sale) — refuse rather than silently overwrite,
    // e.g. a stale Save resurrecting a sold item back to LISTED.
    if (typeof b.expectedUpdatedAt === "string") {
      const expected = new Date(b.expectedUpdatedAt).getTime();
      if (Number.isFinite(expected) && expected !== existing.updatedAt.getTime()) {
        return NextResponse.json(
          { error: "This item was changed since you opened it (another tab or teammate?). Reload the page, then save." },
          { status: 409 }
        );
      }
    }

    const data: Record<string, unknown> = {};

    // Money fields: empty string clears the value, an unparseable or negative
    // value is a 400 — a typo must never silently null a stored price.
    for (const [key, labelText] of [
      ["msrp", "MSRP"],
      ["sellPrice", "sell price"],
      ["soldPrice", "sold price"],
      ["weightLbs", "weight"],
      ["lengthIn", "length"],
      ["widthIn", "width"],
      ["heightIn", "height"],
    ] as const) {
      const raw = b[key];
      if (raw === undefined) continue;
      if (raw === null || raw === "") {
        data[key] = null;
        continue;
      }
      const parsed = parseMoney(raw);
      if (parsed === null) return badRequest(`Invalid ${labelText} — enter a non-negative number`);
      data[key] = parsed;
    }

    if (b.name !== undefined) {
      const name = strOrNull(b.name);
      if (!name) return badRequest("Name cannot be empty");
      data.name = name;
    }
    if (b.upc !== undefined) data.upc = strOrNull(b.upc)?.replace(/\D/g, "") || null;
    if (b.brand !== undefined) data.brand = strOrNull(b.brand);
    if (b.category !== undefined && CATEGORIES.includes(b.category)) data.category = b.category;
    if (b.condition !== undefined && CONDITIONS.includes(b.condition)) data.condition = b.condition;
    if (b.conditionNotes !== undefined) data.conditionNotes = strOrNull(b.conditionNotes);
    if (b.ourCost !== undefined) {
      const c = parseMoney(b.ourCost);
      if (c === null) return badRequest("Invalid cost — enter a non-negative number");
      data.ourCost = c;
    }
    if (b.serialNumber !== undefined) data.serialNumber = strOrNull(b.serialNumber);
    if (b.returnReason !== undefined) data.returnReason = strOrNull(b.returnReason);
    if (b.storageLocation !== undefined) data.storageLocation = strOrNull(b.storageLocation);
    if (b.platform !== undefined) data.platform = PLATFORMS.includes(b.platform) ? b.platform : null;
    if (b.listingUrl !== undefined) data.listingUrl = strOrNull(b.listingUrl);
    if (b.orderId !== undefined) data.orderId = strOrNull(b.orderId);
    if (b.notes !== undefined) data.notes = strOrNull(b.notes);
    if (b.dateListed !== undefined) data.dateListed = parseDate(b.dateListed);
    if (b.dateSold !== undefined) data.dateSold = parseDate(b.dateSold);

    if (b.status !== undefined) {
      if (!ITEM_STATUSES.includes(b.status)) return badRequest("Invalid status");
      data.status = b.status;
      // Stamp lifecycle dates on transitions
      if (b.status === "LISTED" && existing.status !== "LISTED") {
        // Fresh (re)listing: restamp the aging clock and clear any previous
        // sale/return so a later re-sale isn't booked on stale data.
        if (b.dateListed === undefined) data.dateListed = new Date();
        if (b.dateSold === undefined) data.dateSold = null;
        if (b.soldPrice === undefined || b.soldPrice === "") data.soldPrice = null;
        data.dateReturned = null;
        if (b.returnReason === undefined) data.returnReason = null;
      }
      if (b.status === "RETURNED" && existing.status !== "RETURNED") {
        // Sale reversal: the item drops out of SOLD-based revenue by status;
        // sold price/date are kept for reference alongside the return record.
        data.dateReturned = new Date();
      }
      if (b.status === "SOLD") {
        const effectiveDateSold = b.dateSold !== undefined ? data.dateSold : existing.dateSold;
        if (!effectiveDateSold) data.dateSold = new Date();
        // Auto-fill revenue from the list price when no usable sold price was
        // provided (covers the editor sending soldPrice: "" for a blank field).
        const effectiveSoldPrice =
          data.soldPrice !== undefined ? data.soldPrice : existing.soldPrice;
        if (effectiveSoldPrice === null && existing.sellPrice !== null) {
          data.soldPrice = existing.sellPrice;
        }
      }
    }

    await prisma.item.update({ where: { id }, data });
    await recalcPalletStatus(existing.palletId);
    if (data.status && data.status !== existing.status) {
      logActivity(user.name, "item.status", `${existing.sku}: ${existing.status} → ${data.status}`);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const existing = await prisma.item.findUnique({ where: { id }, select: { palletId: true, sku: true } });
    if (!existing) return notFound("Item not found");
    await prisma.item.delete({ where: { id } });
    await recalcPalletStatus(existing.palletId);
    logActivity(user.name, "item.delete", existing.sku);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
