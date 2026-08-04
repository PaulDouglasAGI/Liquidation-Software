import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseMoney, serverError, unauthorized } from "@/lib/api";
import { estimateFees } from "@/lib/fees";
import { getFeeRates } from "@/lib/settings";
import { splitByWeight } from "@/lib/fulfillmentMath";
import { recalcPalletStatus } from "@/lib/pallets";
import { logActivity } from "@/lib/activity";
import { LOT_STATUSES, type LotStatusValue } from "@/lib/constants";

/**
 * A sold lot is a closed sale. Reopening it would resurrect every item as
 * sellable stock and silently erase the revenue from P&L, so SOLD is terminal.
 */
const ALLOWED: Record<LotStatusValue, LotStatusValue[]> = {
  DRAFT: ["LISTED", "SOLD", "CANCELLED"],
  LISTED: ["DRAFT", "SOLD", "CANCELLED"],
  SOLD: [],
  CANCELLED: [],
};

/**
 * PATCH /api/lots/[id] — { status, soldPrice?, platform? }
 *
 * Selling a lot settles every item in it: the sale price is split across the
 * units by their asking prices, to the cent, so per-item and per-pallet P&L
 * stay meaningful instead of one unit carrying the whole lot's revenue.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const lot = await prisma.lot.findUnique({ where: { id }, include: { items: true } });
    if (!lot) return notFound("Lot not found");

    const b = await req.json().catch(() => null);
    const status = typeof b?.status === "string" ? b.status : "";
    if (!(LOT_STATUSES as readonly string[]).includes(status)) return badRequest("Invalid status");

    const current = lot.status as LotStatusValue;
    const next = status as LotStatusValue;
    if (next !== current && !ALLOWED[current].includes(next)) {
      return badRequest(
        current === "SOLD"
          ? "This lot has already sold. Record a return on the individual items instead."
          : `Cannot move a lot from ${current} to ${next}`
      );
    }

    const now = new Date();
    const rates = await getFeeRates();
    const palletIds = [...new Set(lot.items.map((i) => i.palletId))];

    if (next === "SOLD") {
      const soldPrice = parseMoney(b.soldPrice) ?? lot.askingPrice?.toNumber() ?? null;
      if (soldPrice === null) return badRequest("Set a sale price for the lot");
      if (lot.items.length === 0) return badRequest("This lot has no items");
      const platform = (typeof b.platform === "string" ? b.platform : lot.platform) ?? "OTHER";

      // Weight by asking price; splitByWeight falls back to an even split when
      // no item is priced, so nothing is ever booked at $0 against full COGS.
      const shares = splitByWeight(soldPrice, lot.items.map((i) => i.sellPrice?.toNumber() ?? 0));

      await prisma.$transaction(async (tx) => {
        for (const [idx, item] of lot.items.entries()) {
          const share = shares[idx];
          await tx.item.update({
            where: { id: item.id },
            data: {
              status: "SOLD",
              soldPrice: share,
              platform: platform as never,
              dateSold: now,
              feesAmount: estimateFees(share, platform, rates),
            },
          });
        }
        await tx.lot.update({
          where: { id },
          data: { status: "SOLD", soldPrice, dateSold: now, platform: platform as never },
        });
        for (const palletId of palletIds) await recalcPalletStatus(palletId, tx);
      }, { timeout: 30_000 });

      logActivity(user.name, "lot.sold", `${lot.lotCode} sold for ${soldPrice}`);
      return NextResponse.json({ ok: true, status: next, itemsSettled: lot.items.length });
    }

    if (next === "CANCELLED") {
      // Break the bundle up, restoring each item to what it actually was
      // before it joined — a blanket LISTED invents marketplace listings for
      // items that were never posted.
      const listed = lot.items.filter((i) => i.dateListed).map((i) => i.id);
      const unlisted = lot.items.filter((i) => !i.dateListed).map((i) => i.id);
      await prisma.$transaction(async (tx) => {
        if (listed.length) {
          await tx.item.updateMany({ where: { id: { in: listed } }, data: { lotId: null, status: "LISTED" } });
        }
        if (unlisted.length) {
          await tx.item.updateMany({ where: { id: { in: unlisted } }, data: { lotId: null, status: "IN_STOCK" } });
        }
        await tx.lot.update({ where: { id }, data: { status: "CANCELLED" } });
        for (const palletId of palletIds) await recalcPalletStatus(palletId, tx);
      }, { timeout: 30_000 });
      logActivity(user.name, "lot.cancel", `${lot.lotCode} broken up`);
      return NextResponse.json({ ok: true, status: next });
    }

    await prisma.$transaction(async (tx) => {
      await tx.lot.update({
        where: { id },
        data: {
          status: next as never,
          dateListed: next === "LISTED" ? (lot.dateListed ?? now) : lot.dateListed,
        },
      });
      for (const palletId of palletIds) await recalcPalletStatus(palletId, tx);
    });
    logActivity(user.name, "lot.update", `${lot.lotCode} -> ${next}`);
    return NextResponse.json({ ok: true, status: next });
  } catch (e) {
    return serverError(e);
  }
}
