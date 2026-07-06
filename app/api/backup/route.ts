import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/api";
import { toPlain } from "@/lib/serialize";

/**
 * One-click full data backup as JSON (Settings → Download backup).
 * Includes all business data; excludes password hashes and API credentials.
 * Item photo FILES are not embedded — back up the uploads directory alongside.
 */
export async function GET() {
  if (!(await apiUser())) return unauthorized();

  const [pallets, items, expenses, supplierPurchases, settings, templates, locations, users] =
    await Promise.all([
      prisma.pallet.findMany({ orderBy: { palletCode: "asc" } }),
      prisma.item.findMany({ orderBy: { sku: "asc" } }),
      prisma.expense.findMany({ orderBy: { date: "asc" } }),
      prisma.supplierPurchase.findMany({ orderBy: { purchaseDate: "asc" } }),
      prisma.setting.findMany(),
      prisma.listingTemplate.findMany(),
      prisma.storageLocation.findMany(),
      prisma.user.findMany({ select: { id: true, email: true, name: true, createdAt: true } }),
    ]);

  const backup = {
    app: "liquidation-ops",
    version: 2,
    exportedAt: new Date().toISOString(),
    counts: { pallets: pallets.length, items: items.length, expenses: expenses.length },
    pallets: toPlain(pallets),
    items: toPlain(items),
    expenses: toPlain(expenses),
    supplierPurchases: toPlain(supplierPurchases),
    // API credentials stay out of backups on purpose
    settings: settings.filter((s) => !/^(ebay|amazon|upc)\./.test(s.key)),
    listingTemplates: templates,
    storageLocations: locations,
    users: toPlain(users),
  };

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="liqops-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
