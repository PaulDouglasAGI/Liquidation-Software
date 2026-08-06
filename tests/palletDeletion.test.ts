import { describe, expect, it } from "vitest";
import { checkPalletDeletion } from "@/lib/palletStatus";

const counts = (o: Partial<Parameters<typeof checkPalletDeletion>[0]> = {}) => ({
  total: 37, sold: 0, onOrder: 0, inLot: 0, returned: 0, ...o,
});

describe("checkPalletDeletion — undo a wrong manifest, never a real sale", () => {
  it("allows wiping a freshly mis-imported pallet", () => {
    // The whole point: importing the wrong CSV is a normal mistake.
    const r = checkPalletDeletion(counts());
    expect(r.allowed).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it("allows an empty pallet", () => {
    expect(checkPalletDeletion(counts({ total: 0 })).allowed).toBe(true);
  });

  it("refuses when anything has sold — that revenue is in P&L", () => {
    const r = checkPalletDeletion(counts({ sold: 1 }));
    expect(r.allowed).toBe(false);
    expect(r.blockers[0]).toContain("already sold");
    expect(r.blockers[0]).toContain("Scrap them instead");
  });

  it("refuses when items sit on an open order, and says where to go", () => {
    const r = checkPalletDeletion(counts({ onOrder: 3 }));
    expect(r.allowed).toBe(false);
    expect(r.blockers[0]).toContain("Ship Today");
  });

  it("refuses when items are committed to a lot", () => {
    const r = checkPalletDeletion(counts({ inLot: 5 }));
    expect(r.allowed).toBe(false);
    expect(r.blockers[0]).toContain("break the lot up");
  });

  it("refuses on returned items — that is sale history too", () => {
    expect(checkPalletDeletion(counts({ returned: 2 })).allowed).toBe(false);
  });

  it("reports every blocker at once, so the fix is not discovered one at a time", () => {
    const r = checkPalletDeletion(counts({ sold: 2, onOrder: 1, inLot: 4, returned: 1 }));
    expect(r.allowed).toBe(false);
    expect(r.blockers).toHaveLength(4);
  });

  it("gets the singular/plural right — this text is read under pressure", () => {
    expect(checkPalletDeletion(counts({ sold: 1 })).blockers[0]).toContain("1 item already sold");
    expect(checkPalletDeletion(counts({ sold: 2 })).blockers[0]).toContain("2 items already sold");
  });
});
