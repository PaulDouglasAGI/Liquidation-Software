import type { PrismaClient } from "@prisma/client";

// Deliberately no "server-only" import: this module is shared by the Next.js
// setup API route and the standalone prisma/seed.ts script.

export const DEFAULT_SETTINGS: Record<string, string> = {
  defaultPricePct: "50",
  agingDays: "30",
  lowMarginPct: "20",
};

export const DEFAULT_TITLE_TEMPLATE = "{brand} {name} - {condition}";

export const DEFAULT_DESCRIPTION_TEMPLATE = `{brand} {name}

Condition: {condition}
{conditionNotes}

MSRP: {msrp}
SKU: {sku}

Sold by a small liquidation reseller. Item photos show the exact unit you will receive. Ships within 1 business day.`;

export const DEFAULT_LOCATIONS = ["SHELF-A1", "SHELF-A2", "SHELF-A3", "SHELF-B1", "SHELF-B2", "FLOOR-1"];

const TEMPLATE_CATEGORIES = ["POWER_TOOLS", "HAND_TOOLS", "HARDWARE", "APPLIANCES", "MIXED"] as const;

/**
 * Idempotently creates the default settings, listing templates, and starter
 * storage locations. Called by the first-run setup wizard and the seed script.
 */
export async function ensureDefaults(prisma: PrismaClient) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  for (const category of TEMPLATE_CATEGORIES) {
    await prisma.listingTemplate.upsert({
      where: { category },
      update: {},
      create: {
        category,
        titleTemplate: DEFAULT_TITLE_TEMPLATE,
        descriptionTemplate: DEFAULT_DESCRIPTION_TEMPLATE,
      },
    });
  }
  for (const code of DEFAULT_LOCATIONS) {
    await prisma.storageLocation.upsert({ where: { code }, update: {}, create: { code } });
  }
}
