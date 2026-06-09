import "server-only";

export interface UpcResult {
  found: boolean;
  name?: string;
  brand?: string;
  category?: string;
  msrp?: number;
  imageUrl?: string;
}

/**
 * Look up a UPC via upcitemdb.com. The trial endpoint works without a key
 * (rate-limited); set UPC_API_KEY to use the paid endpoint.
 */
export async function lookupUpc(upc: string): Promise<UpcResult> {
  const key = process.env.UPC_API_KEY;
  const url = key
    ? `https://api.upcitemdb.com/prod/v1/lookup?upc=${encodeURIComponent(upc)}`
    : `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`;

  const res = await fetch(url, {
    headers: key ? { user_key: key, key_type: "3scale" } : {},
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    if (res.status === 404) return { found: false };
    throw new Error(`UPC lookup failed (${res.status})`);
  }
  const data = await res.json();
  const item = data?.items?.[0];
  if (!item) return { found: false };

  // Prefer explicit MSRP, fall back to highest offer price seen.
  let msrp: number | undefined =
    typeof item.msrp === "number" && item.msrp > 0 ? item.msrp : undefined;
  if (!msrp && typeof item.highest_recorded_price === "number" && item.highest_recorded_price > 0) {
    msrp = item.highest_recorded_price;
  }

  return {
    found: true,
    name: item.title || undefined,
    brand: item.brand || undefined,
    category: item.category || undefined,
    msrp,
    imageUrl: Array.isArray(item.images) ? item.images[0] : undefined,
  };
}
