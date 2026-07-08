// Pure fee/net-profit math (no server-only imports, unit-testable).
// Rates are percentages, e.g. 13.25 means 13.25% of the sale price.

export interface FeeRates {
  EBAY: number;
  AMAZON: number;
  FACEBOOK: number;
  OTHER: number;
}

export const DEFAULT_FEE_RATES: FeeRates = {
  EBAY: 13.25,
  AMAZON: 15,
  FACEBOOK: 5,
  OTHER: 0,
};

export function feeRateFor(platform: string | null | undefined, rates: FeeRates): number {
  switch (platform) {
    case "EBAY":
      return rates.EBAY;
    case "AMAZON":
      return rates.AMAZON;
    case "FACEBOOK":
      return rates.FACEBOOK;
    default:
      return rates.OTHER;
  }
}

/** Estimated platform fees on a sale, rounded to cents. Null when price is unusable. */
export function estimateFees(
  price: number | null | undefined,
  platform: string | null | undefined,
  rates: FeeRates
): number | null {
  if (price === null || price === undefined || !Number.isFinite(price) || price < 0) return null;
  return Math.round(price * feeRateFor(platform, rates)) / 100;
}

/** What actually lands in the bank after fees, shipping, and cost of goods. */
export function netProfit(x: {
  soldPrice: number | null | undefined;
  ourCost: number;
  fees?: number | null;
  shipping?: number | null;
}): number | null {
  if (x.soldPrice === null || x.soldPrice === undefined || !Number.isFinite(x.soldPrice)) return null;
  return Math.round((x.soldPrice - x.ourCost - (x.fees ?? 0) - (x.shipping ?? 0)) * 100) / 100;
}

/**
 * Lowest sale price that still nets the cost back after platform fees:
 * price − price·pct ≥ cost  ⇒  price ≥ cost / (1 − pct/100).
 */
export function feeAwareFloor(cost: number, pct: number): number {
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  const denom = 1 - Math.min(Math.max(pct, 0), 99) / 100;
  return Math.round((cost / denom) * 100) / 100;
}
