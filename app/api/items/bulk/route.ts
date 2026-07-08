import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, parseMoney, serverError, unauthorized } from "@/lib/api";
import { recalcPalletStatus } from "@/lib/pallets";
import { logActivity } from "@/lib/activity";
import { estimateFees } from "@/lib/fees";
import { getFeeRates } from "@/lib/settings";

/**
 * Bulk actions over selected items.
 * { ids: string[], action: "markSold" | "relist" | "markListed" | "changeLocation" | "scrap"
 *                        | "repricePctMsrp" | "repriceDiscountPct" | "repriceDiscountFlat",
 *   payload?: { location?, pct?, amount?, platform? } }
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const ids: string[] = Array.isArray(b?.ids) ? b.ids.filter((x: unknown) => typeof x === "string") : [];
    if (ids.length === 0) return badRequest("No items selected");
    const action = b.action as string;
    const payload = b.payload ?? {};

    const items = await prisma.item.findMany({ where: { id: { in: ids } } });
    if (items.length === 0) return badRequest("Items not found");

    let updated = 0;
    switch (action) {
      case "markSold": {
        const rates = await getFeeRates();
        for (const item of items) {
          const soldPrice = parseMoney(payload.soldPrice) ?? item.soldPrice?.toNumber() ?? item.sellPrice?.toNumber() ?? null;
          const feesAmount = item.feesAmount?.toNumber() ?? estimateFees(soldPrice, item.platform, rates);
          await prisma.item.update({
            where: { id: item.id },
            data: { status: "SOLD", soldPrice, feesAmount, dateSold: item.dateSold ?? new Date() },
          });
          updated++;
        }
        break;
      }
      case "markListed": {
        // Non-destructive: only lifts unlisted stock to LISTED. Never touches
        // SOLD items (that would erase sale history) or restamps items already
        // listed (that would reset their aging clock).
        const res = await prisma.item.updateMany({
          where: { id: { in: ids }, status: "IN_STOCK" },
          data: { status: "LISTED", dateListed: new Date() },
        });
        updated = res.count;
        break;
      }
      case "relist": {
        // Explicitly destructive: puts items back on the market as a fresh
        // listing, clearing any previous sale.
        const res = await prisma.item.updateMany({
          where: { id: { in: ids } },
          data: { status: "LISTED", dateListed: new Date(), dateSold: null, soldPrice: null, feesAmount: null, shippingCost: null },
        });
        updated = res.count;
        break;
      }
      case "changeLocation": {
        const location = typeof payload.location === "string" ? payload.location.trim() : "";
        await prisma.item.updateMany({ where: { id: { in: ids } }, data: { storageLocation: location || null } });
        updated = items.length;
        break;
      }
      case "scrap": {
        await prisma.item.updateMany({ where: { id: { in: ids } }, data: { status: "SCRAPPED" } });
        updated = items.length;
        break;
      }
      case "setPrices": {
        // Per-item prices, e.g. applying the Insights repricing suggestions:
        // payload.prices = { itemId: newPrice }
        const prices = payload.prices ?? {};
        for (const item of items) {
          const price = parseMoney(prices[item.id]);
          if (price === null) continue;
          await prisma.item.update({ where: { id: item.id }, data: { sellPrice: price } });
          updated++;
        }
        break;
      }
      case "repricePctMsrp": {
        const pctOfMsrp = parseMoney(payload.pct);
        if (pctOfMsrp === null || pctOfMsrp <= 0) return badRequest("Invalid % of MSRP");
        for (const item of items) {
          if (item.msrp === null) continue;
          const price = Math.round(item.msrp.toNumber() * pctOfMsrp) / 100;
          await prisma.item.update({ where: { id: item.id }, data: { sellPrice: price } });
          updated++;
        }
        break;
      }
      case "repriceDiscountPct": {
        const off = parseMoney(payload.pct);
        if (off === null || off <= 0 || off >= 100) return badRequest("Invalid discount %");
        for (const item of items) {
          if (item.sellPrice === null) continue;
          const price = Math.round(item.sellPrice.toNumber() * (100 - off)) / 100;
          await prisma.item.update({ where: { id: item.id }, data: { sellPrice: price } });
          updated++;
        }
        break;
      }
      case "repriceDiscountFlat": {
        const amount = parseMoney(payload.amount);
        if (amount === null || amount <= 0) return badRequest("Invalid discount amount");
        for (const item of items) {
          if (item.sellPrice === null) continue;
          const price = Math.max(0, Math.round((item.sellPrice.toNumber() - amount) * 100) / 100);
          await prisma.item.update({ where: { id: item.id }, data: { sellPrice: price } });
          updated++;
        }
        break;
      }
      default:
        return badRequest(`Unknown action: ${action}`);
    }

    for (const palletId of new Set(items.map((i) => i.palletId))) {
      await recalcPalletStatus(palletId);
    }
    if (updated > 0) logActivity(user.name, "items.bulk", `${action}: ${updated} item(s)`);
    return NextResponse.json({ ok: true, updated });
  } catch (e) {
    return serverError(e);
  }
}
