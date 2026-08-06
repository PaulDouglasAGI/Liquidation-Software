import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseDate, parseMoney, serverError, unauthorized } from "@/lib/api";
import { CATEGORIES, PALLET_STATUSES } from "@/lib/constants";
import { recalcPalletStatus } from "@/lib/pallets";
import { checkPalletDeletion } from "@/lib/palletStatus";
import { logActivity } from "@/lib/activity";

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

/** Counts the history attached to a pallet, for the deletion guard. */
async function deletionCounts(palletId: string) {
  const [total, sold, returned, onOrder, inLot] = await Promise.all([
    prisma.item.count({ where: { palletId } }),
    prisma.item.count({ where: { palletId, status: "SOLD" } }),
    prisma.item.count({ where: { palletId, status: "RETURNED" } }),
    prisma.item.count({
      where: { palletId, orderRecord: { status: { notIn: ["SHIPPED", "CANCELLED"] } } },
    }),
    prisma.item.count({ where: { palletId, lotId: { not: null } } }),
  ]);
  return { total, sold, returned, onOrder, inLot };
}

/**
 * DELETE /api/pallets/[id] — removes the pallet AND everything on it.
 *
 * Importing the wrong manifest is a normal mistake; this is the way back.
 * Blocked when the pallet carries real history (see checkPalletDeletion), so a
 * recorded sale can never be silently erased from P&L.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const pallet = await prisma.pallet.findUnique({ where: { id }, select: { palletCode: true } });
    if (!pallet) return notFound("Pallet not found");

    const counts = await deletionCounts(id);
    const check = checkPalletDeletion(counts);
    if (!check.allowed) {
      return NextResponse.json(
        { error: `Cannot delete ${pallet.palletCode}`, blockers: check.blockers },
        { status: 409 }
      );
    }

    // Items cascade from the pallet FK, so this removes both in one statement.
    await prisma.pallet.delete({ where: { id } });
    logActivity(user.name, "pallet.delete", `${pallet.palletCode} and ${counts.total} item(s)`);
    return NextResponse.json({ ok: true, deletedItems: counts.total, palletCode: pallet.palletCode });
  } catch (e) {
    return serverError(e);
  }
}

/** POST /api/pallets/[id] with {action:"allocate"} evenly spreads pallet cost across items. */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    if (b?.action !== "allocate" && b?.action !== "clearItems") {
      return badRequest("Unknown action");
    }

    // Wrong CSV on the right pallet: empty it so the correct one can be
    // imported, without losing the pallet's code, supplier, or cost.
    if (b.action === "clearItems") {
      const existing = await prisma.pallet.findUnique({ where: { id }, select: { palletCode: true } });
      if (!existing) return notFound("Pallet not found");
      const counts = await deletionCounts(id);
      const check = checkPalletDeletion(counts);
      if (!check.allowed) {
        return NextResponse.json(
          { error: `Cannot clear ${existing.palletCode}`, blockers: check.blockers },
          { status: 409 }
        );
      }
      const { count } = await prisma.item.deleteMany({ where: { palletId: id } });
      await recalcPalletStatus(id);
      logActivity(user.name, "pallet.clear", `${existing.palletCode}: removed ${count} item(s)`);
      return NextResponse.json({ ok: true, cleared: count, palletCode: existing.palletCode });
    }
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
