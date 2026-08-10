import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseDate, parseMoney, serverError, unauthorized } from "@/lib/api";
import { MAX_MEASURE, MAX_MONEY } from "@/lib/parse";
import { recalcPalletStatus } from "@/lib/pallets";
import { CATEGORIES, CONDITIONS, DUD_REASONS, ITEM_STATUSES, PLATFORMS, VALUE_CLASSES } from "@/lib/constants";
import { toPlain } from "@/lib/serialize";
import { logActivity } from "@/lib/activity";
import { estimateFees } from "@/lib/fees";
import { getFeeRates } from "@/lib/settings";

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
    for (const [key, labelText, ceiling] of [
      ["msrp", "MSRP", MAX_MONEY],
      ["sellPrice", "sell price", MAX_MONEY],
      ["soldPrice", "sold price", MAX_MONEY],
      ["feesAmount", "fees", MAX_MONEY],
      ["shippingCost", "shipping cost", MAX_MONEY],
      ["weightLbs", "weight", MAX_MEASURE],
      ["lengthIn", "length", MAX_MEASURE],
      ["widthIn", "width", MAX_MEASURE],
      ["heightIn", "height", MAX_MEASURE],
    ] as const) {
      const raw = b[key];
      if (raw === undefined) continue;
      if (raw === null || raw === "") {
        data[key] = null;
        continue;
      }
      const parsed = parseMoney(raw);
      if (parsed === null) return badRequest(`Invalid ${labelText} — enter a non-negative number`);
      // A fat-fingered extra digit overflowed the column and came back as a
      // 500 with the raw database query in the message.
      if (parsed > ceiling) return badRequest(`That ${labelText} is too large — maximum is ${ceiling}`);
      data[key] = parsed;
    }

    if (b.name !== undefined) {
      const name = strOrNull(b.name);
      if (!name) return badRequest("Name cannot be empty");
      data.name = name;
    }
    if (b.upc !== undefined) data.upc = strOrNull(b.upc)?.replace(/\D/g, "") || null;
    if (b.brand !== undefined) data.brand = strOrNull(b.brand);
    // Say no to an unknown value rather than dropping it. Silently ignoring it
    // returned 200 to someone who had just watched their edit not happen.
    if (b.category !== undefined) {
      if (!CATEGORIES.includes(b.category)) return badRequest("Invalid category");
      data.category = b.category;
    }
    if (b.condition !== undefined) {
      if (!CONDITIONS.includes(b.condition)) return badRequest("Invalid condition");
      data.condition = b.condition;
    }
    if (b.conditionNotes !== undefined) data.conditionNotes = strOrNull(b.conditionNotes);
    if (b.ourCost !== undefined) {
      const c = parseMoney(b.ourCost);
      if (c === null) return badRequest("Invalid cost — enter a non-negative number");
      if (c > MAX_MONEY) return badRequest(`That cost is too large — maximum is ${MAX_MONEY}`);
      data.ourCost = c;
    }
    // Lot-performance tagging. valueClass separates stock we can bid against
    // from stock that is upside; isDud feeds the attrition rate.
    if (b.valueClass !== undefined) {
      data.valueClass = VALUE_CLASSES.includes(b.valueClass) ? b.valueClass : null;
    }
    if (b.isDud !== undefined) {
      data.isDud = b.isDud === true || b.isDud === "true";
      // Untagging a dud must not leave the old reason behind, or the reason
      // breakdown keeps counting a unit the dud rate no longer counts.
      if (!data.isDud) data.dudReason = null;
    }
    if (b.dudReason !== undefined && data.dudReason === undefined) {
      data.dudReason = DUD_REASONS.includes(b.dudReason) ? b.dudReason : null;
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
        if (b.feesAmount === undefined || b.feesAmount === "") data.feesAmount = null;
        if (b.shippingCost === undefined || b.shippingCost === "") data.shippingCost = null;
        // dateReturned and returnReason deliberately survive. Clearing them
        // meant that putting a return back on the shelf — the normal thing to
        // do with one — erased the fact that it ever came back. Return rate
        // read 0.0% on a business taking returns on 3% of sales, and nobody
        // could ask which supplier or category comes back.
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
        // Stamp estimated platform fees so profit numbers are net of fees.
        // data.soldPrice may be a plain number (money loop) or a Prisma
        // Decimal (the sellPrice auto-fill above); normalize before math.
        const effectiveFees = data.feesAmount !== undefined ? data.feesAmount : existing.feesAmount;
        if (effectiveFees === null) {
          const asNum = (v: unknown): number | null =>
            typeof v === "number" ? v : v && typeof v === "object" && "toNumber" in v ? (v as { toNumber(): number }).toNumber() : null;
          const priceForFees =
            data.soldPrice !== undefined ? asNum(data.soldPrice) : asNum(existing.soldPrice);
          const platform = (data.platform as string | undefined) ?? existing.platform ?? null;
          const fees = estimateFees(priceForFees, platform, await getFeeRates());
          if (fees !== null) data.feesAmount = fees;
        }
      }
    }

    const saved = await prisma.item.update({ where: { id }, data, select: { updatedAt: true } });
    await recalcPalletStatus(existing.palletId);
    if (data.status && data.status !== existing.status) {
      logActivity(user.name, "item.status", `${existing.sku}: ${existing.status} → ${data.status}`);
    }
    // The editor adopts this for its next optimistic-concurrency check.
    return NextResponse.json({ ok: true, updatedAt: saved.updatedAt });
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
