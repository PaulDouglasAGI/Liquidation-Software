import { prisma } from "@/lib/db";
import { isOwner, requireUser } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import SettingsClient from "@/components/SettingsClient";

export const dynamic = "force-dynamic";

const CRED_KEYS = [
  "ebay.appId",
  "ebay.certId",
  "ebay.devId",
  "ebay.authToken",
  "ebay.ruName",
  "amazon.accessKey",
  "amazon.secretKey",
  "amazon.sellerId",
  "amazon.marketplaceId",
  "upc.apiKey",
  "ai.anthropicKey",
] as const;

const ENV_FALLBACKS: Record<string, string | undefined> = {
  "ebay.appId": process.env.EBAY_APP_ID,
  "ebay.certId": process.env.EBAY_CERT_ID,
  "ebay.devId": process.env.EBAY_DEV_ID,
  "ebay.authToken": process.env.EBAY_AUTH_TOKEN,
  "ebay.ruName": process.env.EBAY_RU_NAME,
  "amazon.accessKey": process.env.AMAZON_ACCESS_KEY,
  "amazon.secretKey": process.env.AMAZON_SECRET_KEY,
  "amazon.sellerId": process.env.AMAZON_SELLER_ID,
  "amazon.marketplaceId": process.env.AMAZON_MARKETPLACE_ID,
  "upc.apiKey": process.env.UPC_API_KEY,
  "ai.anthropicKey": process.env.ANTHROPIC_API_KEY,
};

export default async function SettingsPage() {
  const me = await requireUser();
  const [settingRows, templates, locations, users, defaultPricePct, agingDays, lowMarginPct, ebayRefreshToken, feeEbay, feeAmazon, feeFacebook, feeOther] =
    await Promise.all([
      prisma.setting.findMany({ where: { key: { in: [...CRED_KEYS] } }, select: { key: true, value: true } }),
      prisma.listingTemplate.findMany({ orderBy: { category: "asc" } }),
      prisma.storageLocation.findMany({ orderBy: { code: "asc" } }),
      prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true, createdAt: true } }),
      getSetting("defaultPricePct"),
      getSetting("agingDays"),
      getSetting("lowMarginPct"),
      getSetting("ebay.refreshToken"),
      getSetting("fees.ebayPct"),
      getSetting("fees.amazonPct"),
      getSetting("fees.facebookPct"),
      getSetting("fees.otherPct"),
    ]);

  const setKeys = new Set(settingRows.filter((r) => r.value).map((r) => r.key));
  const credStatus = Object.fromEntries(
    CRED_KEYS.map((k) => [k, setKeys.has(k) ? "db" : ENV_FALLBACKS[k] ? "env" : "unset"])
  ) as Record<string, "db" | "env" | "unset">;

  return (
    <SettingsClient
      numbers={{ defaultPricePct, agingDays, lowMarginPct }}
      fees={{ ebayPct: feeEbay, amazonPct: feeAmazon, facebookPct: feeFacebook, otherPct: feeOther }}
      credStatus={credStatus}
      templates={templates.map((t) => ({ category: t.category, titleTemplate: t.titleTemplate, descriptionTemplate: t.descriptionTemplate }))}
      locations={locations.map((l) => ({ code: l.code, notes: l.notes }))}
      users={users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt.toISOString() }))}
      myUserId={me.id}
      amOwner={isOwner(me)}
      ebayConnected={Boolean(ebayRefreshToken || process.env.EBAY_REFRESH_TOKEN)}
    />
  );
}
