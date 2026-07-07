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

export function parseMoney(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  // Number(), not parseFloat(): "1O.99" must be rejected, not truncated to 1
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(/^\$/, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function parseDate(v: unknown): Date | null {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v.length === 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}
