import "server-only";
import { prisma } from "./db";

export const SETTING_DEFAULTS: Record<string, string> = {
  defaultPricePct: "50", // default sell price as % of MSRP
  agingDays: "30", // flag listed items older than this
  lowMarginPct: "20", // alert threshold for low-margin items
  "fees.ebayPct": "13.25", // platform fees as % of sale price
  "fees.amazonPct": "15",
  "fees.facebookPct": "5",
  "fees.otherPct": "0",
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? SETTING_DEFAULTS[key] ?? "";
}

export async function getSettingNum(key: string): Promise<number> {
  const v = parseFloat(await getSetting(key));
  return Number.isFinite(v) ? v : parseFloat(SETTING_DEFAULTS[key] ?? "0");
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/** The four per-platform fee percentages, as configured (with defaults). */
export async function getFeeRates() {
  const [EBAY, AMAZON, FACEBOOK, OTHER] = await Promise.all([
    getSettingNum("fees.ebayPct"),
    getSettingNum("fees.amazonPct"),
    getSettingNum("fees.facebookPct"),
    getSettingNum("fees.otherPct"),
  ]);
  return { EBAY, AMAZON, FACEBOOK, OTHER };
}

/** API credential lookup: DB setting first, env var fallback. */
export async function getCred(settingKey: string, envName: string): Promise<string> {
  const fromDb = await prisma.setting.findUnique({ where: { key: settingKey } });
  return fromDb?.value || process.env[envName] || "";
}
