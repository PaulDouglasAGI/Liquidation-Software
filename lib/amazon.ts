import "server-only";
import { toCsv } from "./csv";

const AMAZON_CONDITION: Record<string, string> = {
  NEW: "New",
  LIKE_NEW: "UsedLikeNew",
  GOOD: "UsedGood",
  FAIR: "UsedAcceptable",
  FOR_PARTS: "UsedAcceptable",
};

export interface AmazonRowItem {
  sku: string;
  upc?: string | null;
  sellPrice?: number | null;
  condition: string;
  conditionNotes?: string | null;
}

/**
 * Builds an Amazon inventory loader flat file (tab-delimited) for the given
 * items. Upload via Seller Central > Add Products via Upload.
 */
export function amazonFlatFile(items: AmazonRowItem[]): string {
  const headers = [
    "sku",
    "product-id",
    "product-id-type",
    "price",
    "quantity",
    "condition-type",
    "condition-note",
  ];
  const rows = items.map((i) => [
    i.sku,
    i.upc ?? "",
    i.upc ? "3" : "", // 3 = UPC
    i.sellPrice?.toFixed(2) ?? "",
    "1",
    AMAZON_CONDITION[i.condition] ?? "UsedGood",
    (i.conditionNotes ?? "").slice(0, 1000),
  ]);
  return toCsv(headers, rows, "\t");
}

/**
 * Direct SP-API listing push. The SP-API requires an LWA refresh-token
 * exchange and the Listings Items API; we surface a clear error until
 * credentials are configured rather than pretending to list.
 */
export async function spApiPush(): Promise<never> {
  const hasCreds =
    process.env.AMAZON_ACCESS_KEY && process.env.AMAZON_SECRET_KEY && process.env.AMAZON_SELLER_ID;
  if (!hasCreds) {
    throw new Error(
      "Amazon SP-API credentials are not configured. Use the flat-file export, or add AMAZON_* credentials in Settings."
    );
  }
  throw new Error(
    "Direct SP-API push requires an approved SP-API application with an LWA refresh token. Use the flat-file export for now."
  );
}
