import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseDate, parseMoney, serverError, unauthorized } from "@/lib/api";
import { recalcPalletStatus } from "@/lib/pallets";
import { CATEGORIES, CONDITIONS, ITEM_STATUSES, PLATFORMS } from "@/lib/constants";
import { toPlain } from "@/lib/serialize";

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
  if (!(await apiUser())) return unauthorized();
  try {
    const { id } = await params;
    const b = await req.json().catch(() => null);
    if (!b) return badRequest("Invalid JSON body");
    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) return notFound("Item not found");

    const data: Record<string, unknown> = {};
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
    if (b.msrp !== undefined) data.msrp = parseMoney(b.msrp);
    if (b.ourCost !== undefined) {
      const c = parseMoney(b.ourCost);
      if (c === null) return badRequest("Invalid cost");
      data.ourCost = c;
    }
    if (b.sellPrice !== undefined) data.sellPrice = parseMoney(b.sellPrice);
    if (b.soldPrice !== undefined) data.soldPrice = parseMoney(b.soldPrice);
    if (b.serialNumber !== undefined) data.serialNumber = strOrNull(b.serialNumber);
    if (b.weightLbs !== undefined) data.weightLbs = parseMoney(b.weightLbs);
    if (b.lengthIn !== undefined) data.lengthIn = parseMoney(b.lengthIn);
    if (b.widthIn !== undefined) data.widthIn = parseMoney(b.widthIn);
    if (b.heightIn !== undefined) data.heightIn = parseMoney(b.heightIn);
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
      if (b.status === "LISTED" && !existing.dateListed && b.dateListed === undefined) {
        data.dateListed = new Date();
      }
      if (b.status === "SOLD") {
        if (!existing.dateSold && b.dateSold === undefined) data.dateSold = new Date();
        if (b.soldPrice === undefined && existing.soldPrice === null && existing.sellPrice !== null) {
          data.soldPrice = existing.sellPrice;
        }
      }
    }

    await prisma.item.update({ where: { id }, data });
    await recalcPalletStatus(existing.palletId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await apiUser())) return unauthorized();
  try {
    const { id } = await params;
    const existing = await prisma.item.findUnique({ where: { id }, select: { palletId: true } });
    if (!existing) return notFound("Item not found");
    await prisma.item.delete({ where: { id } });
    await recalcPalletStatus(existing.palletId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
