import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { apiUser } from "@/lib/api";
import { EbayConfigError, oauthAuthorizeUrl } from "@/lib/ebay";

const STATE_COOKIE = "ebay_oauth_state";

/** Sends the browser to eBay's consent screen (Settings → Connect eBay). */
export async function GET(req: NextRequest) {
  if (!(await apiUser())) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
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
