import { describe, expect, it } from "vitest";

/**
 * Runs the invariant checks against a REAL database — `npm run check:data`.
 *
 * Skipped when DATABASE_URL is unset so the ordinary unit suite stays pure and
 * offline. The point of this file is the opposite of a unit test: it makes no
 * fixtures and asserts nothing about code. It asks whether the data that
 * actually exists still describes a coherent warehouse.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("live data consistency", () => {
  it("has no contradictions between orders, bundles, units and costs", async () => {
    const { checkInvariants } = await import("@/lib/invariants");
    const violations = await checkInvariants();

    const errors = violations.filter((v) => v.severity === "error");
    const warnings = violations.filter((v) => v.severity === "warn");

    for (const w of warnings) {
      console.warn(`  warn  ${w.rule}: ${w.detail}\n        ${w.subjects.join("\n        ")}`);
    }
    if (errors.length) {
      const report = errors
        .map((e) => `  ${e.rule}: ${e.detail}\n    ${e.subjects.join("\n    ")}`)
        .join("\n\n");
      throw new Error(`Data is inconsistent:\n\n${report}\n`);
    }
    expect(errors).toEqual([]);
  }, 60_000);
});
