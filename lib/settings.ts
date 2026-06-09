import "server-only";
import { prisma } from "./db";

export const SETTING_DEFAULTS: Record<string, string> = {
  defaultPricePct: "50", // default sell price as % of MSRP
  agingDays: "30", // flag listed items older than this
  lowMarginPct: "20", // alert threshold for low-margin items
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

/** API credential lookup: DB setting first, env var fallback. */
export async function getCred(settingKey: string, envName: string): Promise<string> {
  const fromDb = await prisma.setting.findUnique({ where: { key: settingKey } });
  return fromDb?.value || process.env[envName] || "";
}
