import { describe, expect, it } from "vitest";
import { normalizeBrand } from "@/lib/parse";

describe("normalizeBrand — real manifests spell one brand several ways", () => {
  it("collapses the casing variants found in an actual Home Depot manifest", () => {
    // The same file carried both spellings, splitting one brand's sales history
    // in two and weakening the brand lookup that needs 2+ sales to be trusted.
    expect(normalizeBrand("RYOBI")).toBe("Ryobi");
    expect(normalizeBrand("Ryobi")).toBe("Ryobi");
    expect(normalizeBrand("ryobi")).toBe("Ryobi");
  });

  it("keeps house spelling for brands with unusual capitalisation", () => {
    expect(normalizeBrand("DEWALT")).toBe("DeWalt");
    expect(normalizeBrand("dewalt")).toBe("DeWalt");
    expect(normalizeBrand("RIDGID")).toBe("RIDGID");
    expect(normalizeBrand("Milwaukee")).toBe("Milwaukee");
    expect(normalizeBrand("MILWAUKEE")).toBe("Milwaukee");
  });

  it("ignores punctuation and spacing differences", () => {
    expect(normalizeBrand("Porter Cable")).toBe("Porter-Cable");
    expect(normalizeBrand("porter-cable")).toBe("Porter-Cable");
    expect(normalizeBrand("Black and Decker")).not.toBe("Black and Decker"); // title-cased at minimum
  });

  it("title-cases an unknown brand so casing still cannot diverge", () => {
    expect(normalizeBrand("PACROBAN")).toBe("Pacroban");
    expect(normalizeBrand("pacroban")).toBe("Pacroban");
    expect(normalizeBrand("acme tool co")).toBe("Acme Tool Co");
  });

  it("leaves short all-caps tokens alone rather than mangling them", () => {
    expect(normalizeBrand("EGO")).toBe("EGO");
  });

  it("treats missing or blank as no brand", () => {
    expect(normalizeBrand(null)).toBeNull();
    expect(normalizeBrand("")).toBeNull();
    expect(normalizeBrand("   ")).toBeNull();
    expect(normalizeBrand(42)).toBeNull();
  });

  it("is idempotent — importing twice cannot drift", () => {
    for (const b of ["RYOBI", "dewalt", "Pacroban", "EGO", "Milwaukee"]) {
      const once = normalizeBrand(b);
      expect(normalizeBrand(once)).toBe(once);
    }
  });
});
