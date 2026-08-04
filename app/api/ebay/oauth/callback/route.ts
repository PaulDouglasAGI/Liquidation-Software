import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { isOwner } from "@/lib/auth";
import { exchangeOAuthCode } from "@/lib/ebay";
import { logActivity } from "@/lib/activity";

const STATE_COOKIE = "ebay_oauth_state";

/**
 * eBay redirects here after consent (configure your RuName's "auth accepted
 * URL" to point at /api/ebay/oauth/callback). Verifies the CSRF state, then
 * exchanges the code for a refresh token and stores it.
 */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  // Owner-only: this stores the refresh token that can list and sell.
  if (!isOwner(user)) {
    const denied = new URL("/settings", req.nextUrl.origin);
    denied.searchParams.set("ebayError", "Only an owner can connect the eBay account");
    return NextResponse.redirect(denied);
  }

  const url = new URL("/settings", req.nextUrl.origin);
  const res = () => {
    const r = NextResponse.redirect(url);
    r.cookies.delete(STATE_COOKIE);
    return r;
  };

  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  if (!state || !expected || state !== expected) {
    url.searchParams.set("ebayError", "eBay connection rejected: state mismatch — start again from Settings");
    return res();
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    url.searchParams.set("ebayError", "eBay returned no authorization code (consent declined?)");
    return res();
  }
  try {
    await exchangeOAuthCode(code);
    logActivity(user.name, "ebay.connect", "eBay account connected via OAuth");
    url.searchParams.set("ebay", "connected");
  } catch (e) {
    url.searchParams.set("ebayError", e instanceof Error ? e.message : "eBay connection failed");
  }
  return res();
}
