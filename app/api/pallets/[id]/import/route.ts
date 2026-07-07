import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, notFound, parseMoney, serverError, unauthorized } from "@/lib/api";
import { createItemWithSku } from "@/lib/skus";
import { recalcPalletStatus } from "@/lib/pallets";
import { getSettingNum } from "@/lib/settings";
import { CATEGORIES, CONDITIONS } from "@/lib/constants";
import { logActivity } from "@/lib/activity";

const MAX_ROWS = 500;
const MAX_QTY_PER_ROW = 50;

interface ImportRow {
  name?: unknown;
  upc?: unknown;
  brand?: unknown;
  msrp?: unknown;
  qty?: unknown;
  condition?: unknown;
  category?: unknown;
  notes?: unknown;
}

/**
 * Bulk-create items on a pallet from a parsed manifest CSV.
 * Body: { rows: [{ name, upc?, brand?, msrp?, qty?, condition?, category?, notes? }] }
 * A row with qty N creates N individual items (unit-level inventory).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const { id } = await params;
    const pallet = await prisma.pallet.findUnique({ where: { id } });
    if (!pallet) return notFound("Pallet not found");

    const body = await req.json().catch(() => null);
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return badRequest("No rows to import");
    if (rows.length > MAX_ROWS) return badRequest(`Too many rows (max ${MAX_ROWS} per import)`);

    const pctOfMsrp = await getSettingNum("defaultPricePct");
    let created = 0;
    const errors: string[] = [];

    for (const [idx, raw] of rows.entries()) {
      const name = typeof raw.name === "string" ? raw.name.trim() : "";
      if (!name) {
        errors.push(`Row ${idx + 1}: missing product name — skipped`);
        continue;
      }
      const qtyRaw = String(raw.qty ?? "").trim();
      const qtyNum = qtyRaw === "" ? 1 : parseInt(qtyRaw, 10);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
        errors.push(`Row ${idx + 1}: quantity "${qtyRaw}" — skipped`);
        continue;
      }
      const qty = Math.min(qtyNum, MAX_QTY_PER_ROW);
      const msrp = parseMoney(raw.msrp);
      const sellPrice = msrp !== null ? Math.round(msrp * pctOfMsrp) / 100 : null;
      const conditionRaw = typeof raw.condition === "string" ? raw.condition.trim().toUpperCase().replace(/[\s-]+/g, "_") : "";
      const condition = (CONDITIONS as readonly string[]).includes(conditionRaw) ? conditionRaw : "GOOD";
      const category = (CATEGORIES as readonly string[]).includes(String(raw.category)) ? String(raw.category) : pallet.category;

      for (let n = 0; n < qty; n++) {
        await createItemWithSku(id, {
            name,
            upc: typeof raw.upc === "string" && raw.upc.trim() ? raw.upc.replace(/\D/g, "") || null : null,
            brand: typeof raw.brand === "string" && raw.brand.trim() ? raw.brand.trim() : null,
            category: category as never,
            condition: condition as never,
            msrp,
            sellPrice,
            notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : null,
        });
        created++;
      }
    }

    // Spread pallet cost across items (manifest imports usually happen before
    // per-item costs are known). SOLD items keep their booked cost — changing
    // it would retroactively rewrite P&L margins.
    const total = await prisma.item.count({ where: { palletId: id } });
    if (total > 0) {
      const per = Math.round((pallet.totalCost.toNumber() / total) * 100) / 100;
      await prisma.item.updateMany({
        where: { palletId: id, status: { not: "SOLD" } },
        data: { ourCost: per },
      });
    }
    await recalcPalletStatus(id);

    if (created > 0) logActivity(user.name, "pallet.import", `${created} item(s) into ${pallet.palletCode}`);
    return NextResponse.json({ ok: true, created, skipped: errors.length, errors: errors.slice(0, 20) });
  } catch (e) {
    return serverError(e);
  }
}
