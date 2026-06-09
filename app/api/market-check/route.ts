import { NextRequest, NextResponse } from "next/server";
import { apiUser, badRequest, unauthorized } from "@/lib/api";
import { EbayConfigError, marketCheck } from "@/lib/ebay";

export async function GET(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  const upc = req.nextUrl.searchParams.get("upc") ?? undefined;
  const query = req.nextUrl.searchParams.get("q") ?? undefined;
  if (!upc && !query) return badRequest("Provide upc or q");
  try {
    const result = await marketCheck({ upc, query });
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof EbayConfigError ? 503 : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Market check failed" }, { status });
  }
}
