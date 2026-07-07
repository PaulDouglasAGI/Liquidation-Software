import { NextRequest, NextResponse } from "next/server";
import { apiUser } from "@/lib/api";
import { EbayConfigError, oauthAuthorizeUrl } from "@/lib/ebay";

/** Sends the browser to eBay's consent screen (Settings → Connect eBay). */
export async function GET(req: NextRequest) {
  if (!(await apiUser())) return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  try {
    return NextResponse.redirect(await oauthAuthorizeUrl());
  } catch (e) {
    const msg = e instanceof EbayConfigError ? e.message : "Could not start the eBay connection";
    const url = new URL("/settings", req.nextUrl.origin);
    url.searchParams.set("ebayError", msg);
    return NextResponse.redirect(url);
  }
}
