// Pure shipping estimation (no DB, no carrier API). Deliberately a planning
// tool, not a rate quote: it exists so a price can account for postage BEFORE
// the item sells, instead of discovering the margin was imaginary afterwards.

export interface Dimensions {
  weightLbs: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
}

/**
 * Carriers bill the greater of actual weight and volumetric weight.
 * 139 is the common domestic divisor for ground services.
 */
export const DIM_DIVISOR = 139;

export function dimensionalWeight(d: Dimensions, divisor = DIM_DIVISOR): number | null {
  if (!d.lengthIn || !d.widthIn || !d.heightIn) return null;
  return Math.round(((d.lengthIn * d.widthIn * d.heightIn) / divisor) * 100) / 100;
}

/** What the carrier actually charges on: the greater of real and dim weight. */
export function billableWeight(d: Dimensions): number | null {
  const dim = dimensionalWeight(d);
  const actual = d.weightLbs ?? null;
  if (actual === null && dim === null) return null;
  return Math.max(actual ?? 0, dim ?? 0);
}

/** Simple domestic ground bands, tunable in Settings. */
export interface ShippingRates {
  /** Charged regardless of weight (packaging, handling, base rate). */
  baseFee: number;
  /** Per billable pound above the first pound. */
  perLb: number;
  /** Surcharge once a parcel is genuinely bulky. */
  oversizeThresholdLbs: number;
  oversizeFee: number;
}

export const DEFAULT_SHIPPING_RATES: ShippingRates = {
  baseFee: 8.5,
  perLb: 0.85,
  oversizeThresholdLbs: 50,
  oversizeFee: 25,
};

export interface ShippingEstimate {
  billableLbs: number | null;
  cost: number | null;
  oversize: boolean;
  /** True when dimensions were missing and the figure leans on weight alone. */
  approximate: boolean;
}

export function estimateShipping(d: Dimensions, rates: ShippingRates = DEFAULT_SHIPPING_RATES): ShippingEstimate {
  const billable = billableWeight(d);
  if (billable === null) {
    return { billableLbs: null, cost: null, oversize: false, approximate: true };
  }
  const oversize = billable > rates.oversizeThresholdLbs;
  const cost =
    rates.baseFee +
    Math.max(0, billable - 1) * rates.perLb +
    (oversize ? rates.oversizeFee : 0);
  return {
    billableLbs: Math.round(billable * 100) / 100,
    cost: Math.round(cost * 100) / 100,
    oversize,
    approximate: dimensionalWeight(d) === null,
  };
}

/**
 * True profit once postage is included — the number that decides whether a
 * listing is worth making at all.
 */
export function marginAfterShipping(
  sellPrice: number | null,
  ourCost: number,
  feesPct: number,
  shippingCost: number | null
): { net: number | null; marginPct: number | null } {
  if (sellPrice === null || !Number.isFinite(sellPrice)) return { net: null, marginPct: null };
  const fees = sellPrice * (feesPct / 100);
  const net = Math.round((sellPrice - ourCost - fees - (shippingCost ?? 0)) * 100) / 100;
  return { net, marginPct: sellPrice > 0 ? Math.round((net / sellPrice) * 1000) / 10 : null };
}
