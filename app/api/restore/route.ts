import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";
import { logActivity } from "@/lib/activity";

const MAX_ITEMS = 50_000;

const asArray = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v : []);

/**
 * Restores a backup produced by GET /api/backup, REPLACING all business data
 * (pallets, items, expenses, purchases, templates, locations, non-credential
 * settings). User accounts and saved API credentials are left untouched —
 * backups intentionally contain neither. Photo files are not restored; items
 * keep their photo paths so copying the uploads folder back completes it.
 */
export async function POST(req: NextRequest) {
  const user = await apiUser();
  if (!user) return unauthorized();
  try {
    const body = await req.json().catch(() => null);
    if (body?.confirm !== true) return badRequest("Missing confirmation flag");
    const b = body.backup;
    if (b?.app !== "liquidation-ops") return badRequest("Not a Liquidation Ops backup file");

    const pallets = asArray(b.pallets);
    const items = asArray(b.items);
    const expenses = asArray(b.expenses);
    const purchases = asArray(b.supplierPurchases);
    const settings = asArray(b.settings);
    const templates = asArray(b.listingTemplates);
    const locations = asArray(b.storageLocations);
    if (items.length > MAX_ITEMS) return badRequest("Backup too large");
    if (pallets.length === 0 && items.length === 0) return badRequest("Backup contains no data");

    await prisma.$transaction(
      async (tx) => {
        await tx.item.deleteMany();
        await tx.pallet.deleteMany();
        await tx.expense.deleteMany();
        await tx.supplierPurchase.deleteMany();

        if (pallets.length) await tx.pallet.createMany({ data: pallets as unknown as Prisma.PalletCreateManyInput[] });
        if (items.length) await tx.item.createMany({ data: items as unknown as Prisma.ItemCreateManyInput[] });
        if (expenses.length) await tx.expense.createMany({ data: expenses as unknown as Prisma.ExpenseCreateManyInput[] });
        if (purchases.length) await tx.supplierPurchase.createMany({ data: purchases as unknown as Prisma.SupplierPurchaseCreateManyInput[] });

        for (const s of settings) {
          if (typeof s.key !== "string" || typeof s.value !== "string") continue;
          if (/^(ebay|amazon|upc)\./.test(s.key)) continue; // never restore credentials
          await tx.setting.upsert({ where: { key: s.key }, update: { value: s.value }, create: { key: s.key, value: s.value } });
        }
        for (const t of templates) {
          if (typeof t.category !== "string") continue;
          await tx.listingTemplate.upsert({
            where: { category: t.category as never },
            update: { titleTemplate: String(t.titleTemplate ?? ""), descriptionTemplate: String(t.descriptionTemplate ?? "") },
            create: {
              category: t.category as never,
              titleTemplate: String(t.titleTemplate ?? ""),
              descriptionTemplate: String(t.descriptionTemplate ?? ""),
            },
          });
        }
        for (const l of locations) {
          if (typeof l.code !== "string") continue;
          await tx.storageLocation.upsert({
            where: { code: l.code },
            update: { notes: (l.notes as string) ?? null },
            create: { code: l.code, notes: (l.notes as string) ?? null },
          });
        }
      },
      { timeout: 60_000 }
    );

    logActivity(user.name, "data.restore", `Restored backup from ${b.exportedAt ?? "unknown date"}: ${pallets.length} pallets, ${items.length} items`);
    return NextResponse.json({
      ok: true,
      restored: { pallets: pallets.length, items: items.length, expenses: expenses.length, purchases: purchases.length },
    });
  } catch (e) {
    return serverError(e);
  }
}
