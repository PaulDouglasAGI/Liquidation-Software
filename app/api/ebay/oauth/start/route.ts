import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { apiUser } from "@/lib/api";
import { isOwner } from "@/lib/auth";
import { EbayConfigError, oauthAuthorizeUrl } from "@/lib/ebay";

const STATE_COOKIE = "ebay_oauth_state";

/** Sends the browser to eBay's consent screen (Settings → Connect eBay). */
export async function GET(req: NextRequest) {
  const user = await apiUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  // Connecting eBay writes the business refresh token — a credential change,
  // so it is owner-only just like editing the keyset in Settings.
  if (!isOwner(user)) {
    const denied = new URL("/settings", req.nextUrl.origin);
    denied.searchParams.set("ebayError", "Only an owner can connect the eBay account");
    return NextResponse.redirect(denied);
  }
  try {
    // CSRF protection: the callback only accepts codes carrying this state.
    const state = randomBytes(16).toString("hex");
    const res = NextResponse.redirect(await oauthAuthorizeUrl(state));
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });
    return res;
  } catch (e) {
    const msg = e instanceof EbayConfigError ? e.message : "Could not start the eBay connection";
    const url = new URL("/settings", req.nextUrl.origin);
    url.searchParams.set("ebayError", msg);
    return NextResponse.redirect(url);
  }
}
