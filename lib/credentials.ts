// The single source of truth for which settings are secrets.
//
// This list previously lived as a regex in the backup route and a separate
// array in the settings route. They drifted: `ai.anthropicKey` was added to
// settings but not to the backup filter, so the key was exported in plaintext
// to anyone who could download a backup. One list, imported by both.

/** Marketplace / service credentials — owner-only, never leave the server. */
export const CREDENTIAL_KEYS = [
  "ebay.appId",
  "ebay.certId",
  "ebay.devId",
  "ebay.authToken",
  "ebay.ruName",
  "ebay.refreshToken",
  "amazon.accessKey",
  "amazon.secretKey",
  "amazon.sellerId",
  "amazon.marketplaceId",
  "upc.apiKey",
  "ai.anthropicKey",
] as const;

/** Day-to-day operating knobs — any signed-in user may tune these. */
export const OPERATIONAL_KEYS = [
  "defaultPricePct",
  "agingDays",
  "lowMarginPct",
  "fees.ebayPct",
  "fees.amazonPct",
  "fees.facebookPct",
  "fees.otherPct",
] as const;

const CRED_SET: ReadonlySet<string> = new Set(CREDENTIAL_KEYS);
const OPS_SET: ReadonlySet<string> = new Set(OPERATIONAL_KEYS);

/**
 * True for any secret. Also treats a prefix match as a credential so that a
 * key added to the schema but forgotten here still fails closed (kept out of
 * backups) rather than leaking.
 */
export function isCredentialKey(key: string): boolean {
  if (CRED_SET.has(key)) return true;
  return /^(ebay|amazon|upc|ai)\./.test(key);
}

export const isOperationalKey = (key: string) => OPS_SET.has(key);
export const isKnownSettingKey = (key: string) => OPS_SET.has(key) || CRED_SET.has(key);
