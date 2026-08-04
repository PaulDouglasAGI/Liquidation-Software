import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseDate, parseMoney, serverError, unauthorized } from "@/lib/api";
import { CATEGORIES, PALLET_STATUSES } from "@/lib/constants";
import { recalcPalletStatus } from "@/lib/pallets";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await apiUser())) return unauthorized();
  try {
    const { id } = await params;
    const b = await req.json().catch(() => null);
    if (!b) return badRequest("Invalid JSON body");
    const existing = await prisma.pallet.findUnique({ where: { id } });
    if (!existing) return notFound("Pallet not found");

    const data: Record<string, unknown> = {};
    if (typeof b.supplier === "string" && b.supplier.trim()) data.supplier = b.supplier.trim();
    if (b.purchaseDate !== undefined) {
      const d = parseDate(b.purchaseDate);
      if (!d) return badRequest("Invalid purchase date");
      data.purchaseDate = d;
    }
    if (b.totalCost !== undefined) {
      const c = parseMoney(b.totalCost);
      if (c === null) return badRequest("Invalid pallet cost");
      data.totalCost = c;
    }
    if (b.manifestUrl !== undefined) data.manifestUrl = b.manifestUrl?.trim() || null;
    if (b.category !== undefined && CATEGORIES.includes(b.category)) data.category = b.category;
    if (b.status !== undefined && PALLET_STATUSES.includes(b.status)) data.status = b.status;
    if (b.notes !== undefined) data.notes = b.notes?.trim() || null;

    await prisma.pallet.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await apiUser())) return unauthorized();
  try {
    const { id } = await params;
    const itemCount = await prisma.item.count({ where: { palletId: id } });
    if (itemCount > 0) {
      return badRequest(`Pallet has ${itemCount} items. Remove or move them before deleting.`);
    }
    await prisma.pallet.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}

/** POST /api/pallets/[id] with {action:"allocate"} evenly spreads pallet cost across items. */
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await apiUser())) return unauthorized();
  try {
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    if (b?.action !== "allocate") return badRequest("Unknown action");
    const pallet = await prisma.pallet.findUnique({ where: { id }, include: { items: { select: { id: true } } } });
    if (!pallet) return notFound("Pallet not found");
    if (pallet.items.length === 0) return badRequest("Pallet has no items");
    const per = Math.round((pallet.totalCost.toNumber() / pallet.items.length) * 100) / 100;
    // SOLD items keep the cost they were booked at: rewriting it would change
    // the margin on a closed period that has already been reported.
    const { count } = await prisma.item.updateMany({
      where: { palletId: id, status: { not: "SOLD" } },
      data: { ourCost: per },
    });
    await recalcPalletStatus(id);
    const skipped = pallet.items.length - count;
    return NextResponse.json({ ok: true, perItemCost: per, updated: count, skippedSold: skipped });
  } catch (e) {
    return serverError(e);
  }
}
