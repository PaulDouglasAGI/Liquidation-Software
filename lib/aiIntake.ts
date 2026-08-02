// Claude-assisted intake: turn a photo (and whatever the scanner found) into a
// listing draft. Pure request/response shaping lives here so the prompt and the
// parsing are testable without calling the API.
import { CATEGORIES, CONDITIONS } from "./constants";

export interface IdentifySuggestion {
  name: string;
  brand: string | null;
  category: string;
  condition: string;
  /** Estimated retail price, used to seed sellPrice via the pricing rule. */
  msrp: number | null;
  /** Anything visibly wrong, for the condition notes. */
  conditionNotes: string | null;
  /** 0–100, the model's own confidence. */
  confidence: number;
}

export const IDENTIFY_SYSTEM_PROMPT = `You identify liquidation resale inventory from photographs.

Return ONLY a JSON object, no prose, with exactly these keys:
{
  "name": string,              // concise resale listing title, brand + model + key spec
  "brand": string | null,
  "category": one of ${JSON.stringify(CATEGORIES)},
  "condition": one of ${JSON.stringify(CONDITIONS)},
  "msrp": number | null,       // typical retail price in USD, null if unsure
  "conditionNotes": string | null, // visible damage, missing parts, opened box
  "confidence": number         // 0-100, how sure you are of the identification
}

Rules:
- Judge condition from what is VISIBLE. Sealed retail packaging is NEW.
  Visible wear, scuffs, or a damaged box is not NEW.
- If you cannot identify the item, still return the object with a generic name
  and confidence below 30 rather than inventing a specific model number.
- Never guess a model number you cannot read. Accuracy matters more than detail.`;

/** Clamps the model's answer to values the database will actually accept. */
export function parseSuggestion(raw: string): IdentifySuggestion | null {
  // Models sometimes wrap JSON in ``` fences despite instructions.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }

  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) return null;

  const category = typeof obj.category === "string" && (CATEGORIES as readonly string[]).includes(obj.category)
    ? obj.category
    : "MIXED";
  const condition = typeof obj.condition === "string" && (CONDITIONS as readonly string[]).includes(obj.condition)
    ? obj.condition
    : "GOOD";
  const msrpNum = typeof obj.msrp === "number" ? obj.msrp : parseFloat(String(obj.msrp ?? ""));
  const confNum = typeof obj.confidence === "number" ? obj.confidence : parseFloat(String(obj.confidence ?? ""));

  return {
    name: name.slice(0, 200),
    brand: typeof obj.brand === "string" && obj.brand.trim() ? obj.brand.trim().slice(0, 80) : null,
    category,
    condition,
    msrp: Number.isFinite(msrpNum) && msrpNum > 0 ? Math.round(msrpNum * 100) / 100 : null,
    conditionNotes:
      typeof obj.conditionNotes === "string" && obj.conditionNotes.trim()
        ? obj.conditionNotes.trim().slice(0, 500)
        : null,
    confidence: Number.isFinite(confNum) ? Math.min(100, Math.max(0, Math.round(confNum))) : 0,
  };
}

/** Below this we show the suggestion but don't pre-fill destructive fields. */
export const LOW_CONFIDENCE = 50;

/** Strips a data: URL down to the base64 payload plus its media type. */
export function splitDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/i.exec(dataUrl.trim());
  return m ? { mediaType: m[1].toLowerCase(), data: m[2] } : null;
}
