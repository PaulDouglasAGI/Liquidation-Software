import { describe, expect, it } from "vitest";
import { parseMoney, parseDate } from "@/lib/parse";

describe("parseMoney", () => {
  it("parses plain and formatted values", () => {
    expect(parseMoney("12.34")).toBe(12.34);
    expect(parseMoney(12.345)).toBe(12.35); // rounds to cents
    expect(parseMoney("$1,299.99")).toBe(1299.99);
    expect(parseMoney(" 5 ")).toBe(5);
    expect(parseMoney(0)).toBe(0);
  });

  it("treats empty as null (clear), not zero", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("   ")).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
  });

  it("rejects typos instead of truncating them", () => {
    expect(parseMoney("1O.99")).toBeNull(); // letter O — parseFloat would say 1
    expect(parseMoney("12.34abc")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });

  it("rejects negatives and non-finite values", () => {
    expect(parseMoney("-5")).toBeNull();
    expect(parseMoney(-0.01)).toBeNull();
    expect(parseMoney("Infinity")).toBeNull();
    expect(parseMoney(NaN)).toBeNull();
  });
});

describe("parseDate", () => {
  it("parses date-only strings at midday (avoids TZ day-shift)", () => {
    const d = parseDate("2026-07-04");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(6);
    expect(d!.getDate()).toBe(4);
  });

  it("rejects junk", () => {
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate(42)).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});
