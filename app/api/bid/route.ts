import { NextRequest, NextResponse } from "next/server";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";
import { computeInsights } from "@/lib/insights";
import { getFeeRates } from "@/lib/settings";
import { estimateBid, profitAtBid, type ManifestLine } from "@/lib/bidMath";
import { CATEGORIES } from "@/lib/constants";
import { parseMoney } from "@/lib/parse";

/**
 * POST /api/bid — value a manifest before buying the pallet.
 * { lines: [{ name, category, brand?, qty, msrp }], assumptions?, bid? }
 *
 * The recovery rates come from this business's own sales history, so the
 * answer is "what is this worth to US", not a generic retail estimate.
 */
export async function POST(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const b = await req.json().catch(() => null);
    const raw = Array.isArray(b?.lines) ? b.lines : [];
    if (raw.length === 0) return badRequest("Paste or upload a manifest first");

    const lines: ManifestLine[] = raw.map((l: Record<string, unknown>) => {
      const category = typeof l.category === "string" && (CATEGORIES as readonly string[]).includes(l.category)
        ? l.category
        : "MIXED";
      const qty = parseInt(String(l.qty ?? 1), 10);
      // Manifest lines are pasted straight from a supplier sheet, commas,
      // currency symbols and all.
      const msrp = parseMoney(l.msrp) ?? NaN;
      return {
        name: typeof l.name === "string" ? l.name : "",
        category,
        brand: typeof l.brand === "string" && l.brand.trim() ? l.brand.trim() : null,
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
        msrp: Number.isFinite(msrp) && msrp >= 0 ? msrp : null,
      };
    });

    const [insights, feeRates] = await Promise.all([computeInsights(), getFeeRates()]);
    const estimate = estimateBid(
      lines,
      { byCategory: insights.byCategory, byBrand: insights.byBrand },
      feeRates,
      b.assumptions ?? {}
    );

    const askedBid = parseMoney(b.bid) ?? NaN;
    const atBid = Number.isFinite(askedBid) ? profitAtBid(estimate, askedBid) : null;

    return NextResponse.json({ estimate, atBid });
  } catch (e) {
    return serverError(e);
  }
}
