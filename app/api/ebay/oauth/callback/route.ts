import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { exchangeOAuthCode } from "@/lib/ebay";
import { logActivity } from "@/lib/activity";

/**
 * eBay redirects here after consent (configure your RuName's "auth accepted
 * URL" to point at /api/ebay/oauth/callback). Exchanges the code for a
 * refresh token and stores it.
 */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));

  const url = new URL("/settings", req.nextUrl.origin);
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    url.searchParams.set("ebayError", "eBay returned no authorization code (consent declined?)");
    return NextResponse.redirect(url);
  }
  try {
    await exchangeOAuthCode(code);
    logActivity(user.name, "ebay.connect", "eBay account connected via OAuth");
    url.searchParams.set("ebay", "connected");
  } catch (e) {
    url.searchParams.set("ebayError", e instanceof Error ? e.message : "eBay connection failed");
  }
  return NextResponse.redirect(url);
}
