import { describe, expect, it } from "vitest";
import { estimateFees, netProfit, feeAwareFloor, feeRateFor, DEFAULT_FEE_RATES } from "@/lib/fees";

const rates = { EBAY: 13.25, AMAZON: 15, FACEBOOK: 5, OTHER: 0 };

describe("feeRateFor", () => {
  it("maps platforms and defaults unknown/null to OTHER", () => {
    expect(feeRateFor("EBAY", rates)).toBe(13.25);
    expect(feeRateFor("AMAZON", rates)).toBe(15);
    expect(feeRateFor("FACEBOOK", rates)).toBe(5);
    expect(feeRateFor(null, rates)).toBe(0);
    expect(feeRateFor("SOMETHING", rates)).toBe(0);
  });
});

describe("estimateFees", () => {
  it("computes cents-rounded fees per platform", () => {
    expect(estimateFees(100, "EBAY", rates)).toBe(13.25);
    expect(estimateFees(99.99, "AMAZON", rates)).toBe(15);
    expect(estimateFees(45.5, "FACEBOOK", rates)).toBe(2.28);
    expect(estimateFees(45.5, "OTHER", rates)).toBe(0);
  });
  it("rejects unusable prices", () => {
    expect(estimateFees(null, "EBAY", rates)).toBeNull();
    expect(estimateFees(-1, "EBAY", rates)).toBeNull();
    expect(estimateFees(NaN, "EBAY", rates)).toBeNull();
  });
});

describe("netProfit", () => {
  it("subtracts cost, fees, and shipping", () => {
    expect(netProfit({ soldPrice: 100, ourCost: 60, fees: 13.25, shipping: 8 })).toBe(18.75);
  });
  it("treats missing fees/shipping as zero", () => {
    expect(netProfit({ soldPrice: 100, ourCost: 60 })).toBe(40);
    expect(netProfit({ soldPrice: 100, ourCost: 60, fees: null, shipping: null })).toBe(40);
  });
  it("null when no sale price", () => {
    expect(netProfit({ soldPrice: null, ourCost: 60 })).toBeNull();
  });
});

describe("feeAwareFloor", () => {
  it("grosses cost up so the net never dips below cost", () => {
    const floor = feeAwareFloor(86.75, 13.25);
    expect(floor).toBe(100);
    // selling AT the floor nets back at least the cost
    expect(floor - floor * 0.1325).toBeGreaterThanOrEqual(86.75 - 0.01);
  });
  it("plain cost when the platform takes nothing", () => {
    expect(feeAwareFloor(50, 0)).toBe(50);
  });
  it("safe on degenerate inputs", () => {
    expect(feeAwareFloor(0, 13)).toBe(0);
    expect(feeAwareFloor(50, 100)).toBeGreaterThan(50); // clamped below 100%
  });
});

describe("DEFAULT_FEE_RATES", () => {
  it("matches the documented defaults", () => {
    expect(DEFAULT_FEE_RATES).toEqual({ EBAY: 13.25, AMAZON: 15, FACEBOOK: 5, OTHER: 0 });
  });
});
