import { describe, expect, it } from "vitest";
import { matchCondition } from "@/lib/parse";
import { CONDITIONS } from "@/lib/constants";

const match = (raw: unknown) => matchCondition(raw, CONDITIONS);

describe("matchCondition — suppliers do not write our enum", () => {
  it("takes an exact grade as written", () => {
    expect(match("NEW")).toEqual({ condition: "NEW", via: "exact" });
    expect(match("for_parts")).toEqual({ condition: "FOR_PARTS", via: "exact" });
  });

  it("normalises the separators manifests actually use", () => {
    for (const raw of ["Like New", "like-new", "LIKE_NEW", "  like new  ", "Like/New"]) {
      expect(match(raw).condition).toBe("LIKE_NEW");
    }
  });

  it("grades damaged stock DOWN instead of silently calling it good", () => {
    // A real manifest row read "Damaged". DAMAGED is not one of the five
    // grades, so it fell through to GOOD — the unit imported as good stock at
    // full value, and nothing on screen said otherwise.
    expect(match("Damaged")).toEqual({ condition: "FOR_PARTS", via: "synonym" });
    expect(match("Salvage").condition).toBe("FOR_PARTS");
    expect(match("As-Is").condition).toBe("FOR_PARTS");
    expect(match("Parts Only").condition).toBe("FOR_PARTS");
    expect(match("Non-Functional").condition).toBe("FOR_PARTS");
  });

  it("maps the rest of the common manifest wording", () => {
    expect(match("Sealed").condition).toBe("NEW");
    expect(match("Brand New").condition).toBe("NEW");
    expect(match("Open Box").condition).toBe("LIKE_NEW");
    expect(match("Refurbished").condition).toBe("GOOD");
    expect(match("Shelf Pull").condition).toBe("GOOD");
    expect(match("Scratch and Dent").condition).toBe("FAIR");
    expect(match("Customer Returns").condition).toBe("FAIR");
  });

  it("never resolves to a grade outside the enum", () => {
    const inputs = ["Damaged", "Sealed", "Open Box", "Refurb", "wat", "", "Mint"];
    for (const raw of inputs) {
      expect(CONDITIONS as readonly string[]).toContain(match(raw).condition);
    }
  });

  it("flags anything it had to guess at, so the row can be checked", () => {
    expect(match("Damaged").via).toBe("synonym");
    expect(match("completely made up").via).toBe("fallback");
    // A blank column is a column nobody filled in, not a misread value —
    // warning on every one of those would bury the real warnings.
    expect(match("").via).toBe("exact");
    expect(match(undefined).via).toBe("exact");
  });

  it("falls back to the caller's default only as a last resort", () => {
    expect(match("completely made up").condition).toBe("GOOD");
    expect(matchCondition("nonsense", CONDITIONS, "FAIR").condition).toBe("FAIR");
  });
});
