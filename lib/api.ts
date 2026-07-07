import "server-only";
import { NextResponse } from "next/server";
import { getUser } from "./auth";

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
export const badRequest = (msg: string) => NextResponse.json({ error: msg }, { status: 400 });
export const notFound = (msg = "Not found") => NextResponse.json({ error: msg }, { status: 404 });
export const serverError = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "Internal error" }, { status: 500 });

/** Returns the user or null; API routes should 401 on null. */
export const apiUser = getUser;

export { parseMoney, parseDate } from "./parse";
