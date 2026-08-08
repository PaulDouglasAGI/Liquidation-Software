import { NextResponse } from "next/server";
import { ownerOrResponse, serverError } from "@/lib/api";
import { checkInvariants } from "@/lib/invariants";

/**
 * GET /api/health/data — do the tables still agree with each other?
 *
 * Owner-only: the report names SKUs, order numbers and pallet costs.
 *
 * Returns 200 with `ok: true` when the data is consistent, and 200 with the
 * violations when it is not — this is a report, not a failed request, and a
 * 500 here would be indistinguishable from the endpoint itself being broken.
 */
export async function GET() {
  const owner = await ownerOrResponse();
  if (owner instanceof NextResponse) return owner;
  try {
    const violations = await checkInvariants();
    const errors = violations.filter((x) => x.severity === "error");
    return NextResponse.json({
      ok: errors.length === 0,
      checkedAt: new Date().toISOString(),
      errorCount: errors.length,
      warnCount: violations.length - errors.length,
      violations,
    });
  } catch (e) {
    return serverError(e);
  }
}
