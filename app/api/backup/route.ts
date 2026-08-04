import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/api";
import { toPlain } from "@/lib/serialize";
import { isCredentialKey } from "@/lib/credentials";

/**
 * One-click full data backup as JSON (Settings → Download backup).
 * Includes all business data; excludes password hashes and API credentials.
 * Item photo FILES are not embedded — back up the uploads directory alongside.
 */
export async function GET() {
  if (!(await apiUser())) return unauthorized();

  const [pallets, items, expenses, supplierPurchases, settings, templates, locations, users,
         orders, lots, countSessions, countScans, savedViews] =
    await Promise.all([
      prisma.pallet.findMany({ orderBy: { palletCode: "asc" } }),
      prisma.item.findMany({ orderBy: { sku: "asc" } }),
      prisma.expense.findMany({ orderBy: { date: "asc" } }),
      prisma.supplierPurchase.findMany({ orderBy: { purchaseDate: "asc" } }),
      prisma.setting.findMany(),
      prisma.listingTemplate.findMany(),
      prisma.storageLocation.findMany(),
      prisma.user.findMany({ select: { id: true, email: true, name: true, createdAt: true } }),
      // v7 tables. Items carry FKs to Order and Lot, so a backup without these
      // cannot be restored — the item INSERT fails on a dangling reference.
      prisma.order.findMany({ orderBy: { orderNumber: "asc" } }),
      prisma.lot.findMany({ orderBy: { lotCode: "asc" } }),
      prisma.countSession.findMany({ orderBy: { startedAt: "asc" } }),
      prisma.countScan.findMany(),
      prisma.savedView.findMany(),
    ]);

  const backup = {
    app: "liquidation-ops",
    version: 3,
    exportedAt: new Date().toISOString(),
    counts: {
      pallets: pallets.length, items: items.length, expenses: expenses.length,
      orders: orders.length, lots: lots.length,
    },
    pallets: toPlain(pallets),
    items: toPlain(items),
    expenses: toPlain(expenses),
    supplierPurchases: toPlain(supplierPurchases),
    // API credentials stay out of backups on purpose. Matched against the
    // shared credential list rather than an ad-hoc regex, so a newly added
    // key cannot silently start leaking into every downloaded backup.
    settings: settings.filter((s) => !isCredentialKey(s.key)),
    listingTemplates: templates,
    storageLocations: locations,
    users: toPlain(users),
    orders: toPlain(orders),
    lots: toPlain(lots),
    countSessions: toPlain(countSessions),
    countScans: toPlain(countScans),
    savedViews: toPlain(savedViews),
  };

  return new Response(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="liqops-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
