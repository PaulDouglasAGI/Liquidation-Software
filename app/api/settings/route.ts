import { NextRequest, NextResponse } from "next/server";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";
import { setSetting } from "@/lib/settings";

const ALLOWED_KEYS = new Set([
  "defaultPricePct",
  "agingDays",
  "lowMarginPct",
  "ebay.appId",
  "ebay.certId",
  "ebay.devId",
  "ebay.authToken",
  "amazon.accessKey",
  "amazon.secretKey",
  "amazon.sellerId",
  "amazon.marketplaceId",
  "upc.apiKey",
]);

/** POST { settings: { key: value, ... } } — upserts app settings. */
export async function POST(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const settings = b?.settings;
    if (!settings || typeof settings !== "object") return badRequest("settings object required");
    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED_KEYS.has(key)) return badRequest(`Unknown setting: ${key}`);
      if (typeof value !== "string") return badRequest(`Setting ${key} must be a string`);
    }
    for (const [key, value] of Object.entries(settings)) {
      await setSetting(key, value as string);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
