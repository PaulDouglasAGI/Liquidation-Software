import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { num, toPlain } from "@/lib/serialize";

const dec = (v: string) => new Prisma.Decimal(v);

describe("num", () => {
  it("unwraps a Decimal to a plain number", () => {
    expect(num(dec("19.99"))).toBe(19.99);
  });

  it("keeps null/undefined as null instead of coercing to 0", () => {
    // 0 would be a real price; an absent price must stay distinguishable.
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
  });

  it("preserves an explicit zero", () => {
    expect(num(dec("0"))).toBe(0);
  });
});

describe("toPlain", () => {
  it("converts Decimals and Dates so the client boundary can serialize them", () => {
    const out = toPlain({ price: dec("12.50"), soldAt: new Date("2026-07-20T12:00:00Z") }) as Record<string, unknown>;
    expect(out.price).toBe(12.5);
    expect(out.soldAt).toBe("2026-07-20T12:00:00.000Z");
  });

  it("recurses through nested objects and arrays", () => {
    const out = toPlain({
      pallet: { code: "PAL-2026-001", cost: dec("1000") },
      items: [{ price: dec("10") }, { price: dec("20") }],
    }) as { pallet: { cost: number }; items: { price: number }[] };
    expect(out.pallet.cost).toBe(1000);
    expect(out.items.map((i) => i.price)).toEqual([10, 20]);
  });

  it("passes primitives through untouched", () => {
    expect(toPlain("sku")).toBe("sku");
    expect(toPlain(42)).toBe(42);
    expect(toPlain(true)).toBe(true);
    expect(toPlain(null)).toBeNull();
    expect(toPlain(undefined)).toBeUndefined();
  });

  it("preserves nulls inside objects rather than dropping the key", () => {
    const out = toPlain({ soldPrice: null, name: "Drill" }) as Record<string, unknown>;
    expect(out).toEqual({ soldPrice: null, name: "Drill" });
    expect("soldPrice" in out).toBe(true);
  });

  it("handles an empty array and object", () => {
    expect(toPlain([])).toEqual([]);
    expect(toPlain({})).toEqual({});
  });

  it("result survives JSON round-tripping (the actual requirement)", () => {
    const out = toPlain({ price: dec("12.50"), at: new Date("2026-01-01T00:00:00Z") });
    expect(() => JSON.stringify(out)).not.toThrow();
    expect(JSON.parse(JSON.stringify(out))).toEqual({ price: 12.5, at: "2026-01-01T00:00:00.000Z" });
  });
});
