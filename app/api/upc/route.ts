import { NextRequest, NextResponse } from "next/server";
import { apiUser, badRequest, unauthorized } from "@/lib/api";
import { lookupUpc } from "@/lib/upc";

export async function GET(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  const code = req.nextUrl.searchParams.get("code")?.replace(/\D/g, "");
  if (!code || code.length < 8) return badRequest("Provide a UPC/EAN of at least 8 digits");
  try {
    const result = await lookupUpc(code);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { found: false, error: e instanceof Error ? e.message : "Lookup failed" },
      { status: 502 }
    );
  }
}
