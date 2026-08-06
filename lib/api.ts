import "server-only";
import { NextResponse } from "next/server";
import { getUser, isOwner } from "./auth";

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
export const forbidden = (msg = "Owner access required") =>
  NextResponse.json({ error: msg }, { status: 403 });
export const badRequest = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
export const notFound = (msg = "Not found") => NextResponse.json({ error: msg }, { status: 404 });
export const serverError = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });

/** Returns the user or null; API routes should 401 on null. */
export const apiUser = getUser;

/**
 * Owner-only API routes: returns the user, or the response to send back.
 * Distinguishes "not signed in" (401) from "signed in as staff" (403).
 *
 *   const gate = await ownerOrResponse();
 *   if (gate instanceof NextResponse) return gate;
 */
export async function ownerOrResponse() {
  const user = await getUser();
  if (!user) return unauthorized();
  if (!isOwner(user)) return forbidden();
  return user;
}

export { parseMoney, parseDate, parseCount } from "./parse";
