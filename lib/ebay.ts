import "server-only";
import { getCred, getSetting, setSetting } from "./settings";

const HOSTS = {
  PRODUCTION: { api: "https://api.ebay.com", trading: "https://api.ebay.com/ws/api.dll" },
  SANDBOX: { api: "https://api.sandbox.ebay.com", trading: "https://api.sandbox.ebay.com/ws/api.dll" },
};

function hosts() {
  return process.env.EBAY_ENV === "SANDBOX" ? HOSTS.SANDBOX : HOSTS.PRODUCTION;
}

async function creds() {
  const [appId, certId, devId, authToken] = await Promise.all([
    getCred("ebay.appId", "EBAY_APP_ID"),
    getCred("ebay.certId", "EBAY_CERT_ID"),
    getCred("ebay.devId", "EBAY_DEV_ID"),
    getCred("ebay.authToken", "EBAY_AUTH_TOKEN"),
  ]);
  return { appId, certId, devId, authToken };
}

// ---------------------------------------------------------------------------
// User OAuth (authorization-code flow) — "Connect eBay" in Settings.
// The refresh token lives in the Setting table; short-lived user access
// tokens are minted from it on demand and cached in memory.
// ---------------------------------------------------------------------------

const USER_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
].join(" ");

function authHost() {
  return process.env.EBAY_ENV === "SANDBOX" ? "https://auth.sandbox.ebay.com" : "https://auth.ebay.com";
}

/** Consent-screen URL for the Connect eBay button. */
export async function oauthAuthorizeUrl(): Promise<string> {
  const { appId } = await creds();
  const ruName = await getCred("ebay.ruName", "EBAY_RU_NAME");
  if (!appId || !ruName) {
    throw new EbayConfigError(
      "Connecting eBay needs the App ID, Cert ID, and RuName (redirect URL name) saved in Settings first."
    );
  }
  const q = new URLSearchParams({
    client_id: appId,
    redirect_uri: ruName, // eBay uses the RuName, not a literal URL
    response_type: "code",
    scope: USER_SCOPES,
  });
  return `${authHost()}/oauth2/authorize?${q}`;
}

/** Exchanges the consent code for a refresh token and stores it. */
export async function exchangeOAuthCode(code: string): Promise<void> {
  const { appId, certId } = await creds();
  const ruName = await getCred("ebay.ruName", "EBAY_RU_NAME");
  if (!appId || !certId || !ruName) throw new EbayConfigError("eBay App ID / Cert ID / RuName not configured");
  const res = await fetch(`${hosts().api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${appId}:${certId}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: ruName }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`eBay code exchange failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  if (!data.refresh_token) throw new Error("eBay did not return a refresh token");
  await setSetting("ebay.refreshToken", data.refresh_token);
  cachedUserToken = null;
}

let cachedUserToken: { token: string; expiresAt: number } | null = null;

/** Short-lived user access token from the stored refresh token, or null when not connected. */
export async function getUserAccessToken(): Promise<string | null> {
  if (cachedUserToken && cachedUserToken.expiresAt > Date.now() + 60_000) return cachedUserToken.token;
  const refreshToken = (await getSetting("ebay.refreshToken")) || process.env.EBAY_REFRESH_TOKEN || "";
  if (!refreshToken) return null;
  const { appId, certId } = await creds();
  if (!appId || !certId) return null;
  const res = await fetch(`${hosts().api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${appId}:${certId}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: USER_SCOPES,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`eBay token refresh failed (${res.status}) — reconnect eBay in Settings`);
  const data = await res.json();
  cachedUserToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedUserToken.token;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** OAuth client-credentials token for the Browse API. */
async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const { appId, certId } = await creds();
  if (!appId || !certId) {
    throw new EbayConfigError("eBay App ID / Cert ID not configured. Add them in Settings.");
  }
  const res = await fetch(`${hosts().api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${appId}:${certId}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials&scope=" + encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`eBay OAuth failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

export class EbayConfigError extends Error {}

export interface MarketCheck {
  source: "SOLD" | "ACTIVE";
  count: number;
  avg: number | null;
  low: number | null;
  high: number | null;
  samples: { title: string; price: number; url?: string }[];
}

function stats(prices: number[]) {
  if (prices.length === 0) return { avg: null, low: null, high: null };
  return {
    avg: prices.reduce((a, b) => a + b, 0) / prices.length,
    low: Math.min(...prices),
    high: Math.max(...prices),
  };
}

/**
 * Market check for a UPC or free-text query. Tries the Marketplace Insights
 * API for true sold prices (requires limited-release access); falls back to
 * Browse API active listings as an estimate.
 */
export async function marketCheck(opts: { upc?: string; query?: string }): Promise<MarketCheck> {
  const token = await getAppToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
  };
  const param = opts.upc
    ? `gtin=${encodeURIComponent(opts.upc)}`
    : `q=${encodeURIComponent(opts.query ?? "")}`;

  // Marketplace Insights: last-90-day sold listings (403s without program access).
  const insightsRes = await fetch(
    `${hosts().api}/buy/marketplace_insights/v1_beta/item_sales/search?${param}&limit=50`,
    { headers, signal: AbortSignal.timeout(15_000) }
  );
  if (insightsRes.ok) {
    const data = await insightsRes.json();
    const sales = (data.itemSales ?? []) as Array<{
      title?: string;
      lastSoldPrice?: { value?: string };
      itemWebUrl?: string;
    }>;
    const rows = sales
      .map((s) => ({
        title: s.title ?? "",
        price: parseFloat(s.lastSoldPrice?.value ?? ""),
        url: s.itemWebUrl,
      }))
      .filter((r) => Number.isFinite(r.price));
    return { source: "SOLD", count: rows.length, ...stats(rows.map((r) => r.price)), samples: rows.slice(0, 10) };
  }

  const browseRes = await fetch(
    `${hosts().api}/buy/browse/v1/item_summary/search?${param}&limit=50`,
    { headers, signal: AbortSignal.timeout(15_000) }
  );
  if (!browseRes.ok) throw new Error(`eBay Browse search failed (${browseRes.status}): ${await browseRes.text()}`);
  const data = await browseRes.json();
  const summaries = (data.itemSummaries ?? []) as Array<{
    title?: string;
    price?: { value?: string };
    itemWebUrl?: string;
  }>;
  const rows = summaries
    .map((s) => ({ title: s.title ?? "", price: parseFloat(s.price?.value ?? ""), url: s.itemWebUrl }))
    .filter((r) => Number.isFinite(r.price));
  return { source: "ACTIVE", count: rows.length, ...stats(rows.map((r) => r.price)), samples: rows.slice(0, 10) };
}

const CONDITION_IDS: Record<string, number> = {
  NEW: 1000,
  LIKE_NEW: 2750, // Like New
  GOOD: 3000, // Used
  FAIR: 3000,
  FOR_PARTS: 7000,
};

// Reasonable default leaf categories per our product category (eBay US).
const EBAY_CATEGORY: Record<string, string> = {
  POWER_TOOLS: "632", // Tools & Workshop Equipment > Power Tools
  HAND_TOOLS: "3244",
  HARDWARE: "180950",
  APPLIANCES: "20710",
  MIXED: "12576", // Business & Industrial
};

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Round to whole ounces FIRST, then carry — 2.99 lbs must become 3 lbs 0 oz,
// not 2 lbs 16 oz (eBay rejects WeightMinor >= 16).
function buildWeightXml(weightLbs: number): string {
  const totalOz = Math.round(weightLbs * 16);
  const major = Math.floor(totalOz / 16);
  const minor = totalOz % 16;
  return `<ShippingPackageDetails><WeightMajor unit="lbs">${major}</WeightMajor><WeightMinor unit="oz">${minor}</WeightMinor></ShippingPackageDetails>`;
}

export interface EbayListingInput {
  title: string;
  description: string;
  condition: string;
  category: string;
  price: number;
  upc?: string | null;
  photoUrls: string[];
  weightLbs?: number | null;
}

/** Create a fixed-price eBay listing via the Trading API. Returns the eBay item ID. */
export async function addFixedPriceItem(input: EbayListingInput): Promise<{ itemId: string; url: string }> {
  const { appId, certId, devId, authToken } = await creds();
  // Prefer the OAuth connection (Settings → Connect eBay); fall back to a
  // manually pasted legacy Auth Token.
  const oauthToken = await getUserAccessToken().catch(() => null);
  if (!appId || !certId || !devId || (!oauthToken && !authToken)) {
    throw new EbayConfigError(
      "eBay is not connected. In Settings, save your App ID / Cert ID / Dev ID / RuName and click Connect eBay."
    );
  }
  const title = input.title.slice(0, 80);
  // "]]>" inside the description would terminate the CDATA section early
  const description = input.description.replace(/\]\]>/g, "]]]]><![CDATA[>");
  const pictures = input.photoUrls
    .filter((u) => u.startsWith("http"))
    .slice(0, 8)
    .map((u) => `<PictureURL>${xmlEscape(u)}</PictureURL>`)
    .join("");

  // With an OAuth token, credentials travel in the X-EBAY-API-IAF-TOKEN
  // header; the legacy path embeds the Auth Token in the XML body.
  const requesterCredentials = oauthToken
    ? ""
    : `<RequesterCredentials><eBayAuthToken>${xmlEscape(authToken)}</eBayAuthToken></RequesterCredentials>`;

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  ${requesterCredentials}
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title>${xmlEscape(title)}</Title>
    <Description><![CDATA[${description}]]></Description>
    <PrimaryCategory><CategoryID>${EBAY_CATEGORY[input.category] ?? EBAY_CATEGORY.MIXED}</CategoryID></PrimaryCategory>
    <StartPrice>${input.price.toFixed(2)}</StartPrice>
    <ConditionID>${CONDITION_IDS[input.condition] ?? 3000}</ConditionID>
    <Country>US</Country>
    <Currency>USD</Currency>
    <DispatchTimeMax>1</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    ${input.upc ? `<ProductListingDetails><UPC>${xmlEscape(input.upc)}</UPC></ProductListingDetails>` : ""}
    ${pictures ? `<PictureDetails>${pictures}</PictureDetails>` : ""}
    <Quantity>1</Quantity>
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
      <ReturnsWithinOption>Days_30</ReturnsWithinOption>
      <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
    </ReturnPolicy>
    <ShippingDetails>
      <ShippingType>Calculated</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>USPSPriority</ShippingService>
      </ShippingServiceOptions>
    </ShippingDetails>
    ${input.weightLbs ? buildWeightXml(input.weightLbs) : ""}
    <Site>US</Site>
  </Item>
</AddFixedPriceItemRequest>`;

  const res = await fetch(hosts().trading, {
    method: "POST",
    headers: {
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1193",
      "X-EBAY-API-CALL-NAME": "AddFixedPriceItem",
      "X-EBAY-API-SITEID": "0",
      "X-EBAY-API-APP-NAME": appId,
      "X-EBAY-API-DEV-NAME": devId,
      ...(oauthToken ? { "X-EBAY-API-IAF-TOKEN": oauthToken } : {}),
      "X-EBAY-API-CERT-NAME": certId,
      "Content-Type": "text/xml",
    },
    body: xml,
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  const ack = body.match(/<Ack>(.*?)<\/Ack>/)?.[1];
  if (ack !== "Success" && ack !== "Warning") {
    const err = body.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] ?? `HTTP ${res.status}`;
    throw new Error(`eBay listing failed: ${err}`);
  }
  const itemId = body.match(/<ItemID>(\d+)<\/ItemID>/)?.[1];
  if (!itemId) throw new Error("eBay did not return an ItemID");
  const base = process.env.EBAY_ENV === "SANDBOX" ? "https://sandbox.ebay.com" : "https://www.ebay.com";
  return { itemId, url: `${base}/itm/${itemId}` };
}
