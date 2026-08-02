import { NextRequest, NextResponse } from "next/server";
import { apiUser, badRequest, serverError, unauthorized } from "@/lib/api";
import { getCred } from "@/lib/settings";
import { IDENTIFY_SYSTEM_PROMPT, parseSuggestion, splitDataUrl } from "@/lib/aiIntake";

const MODEL = "claude-sonnet-5";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/ai/identify { image: dataUrl, upc?, hint? }
 * Suggests a listing title, brand, category, condition, and retail price.
 *
 * Disabled rather than broken when no API key is configured — intake keeps
 * working by hand, this only ever accelerates it.
 */
export async function POST(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  try {
    const apiKey = await getCred("ai.anthropicKey", "ANTHROPIC_API_KEY");
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI intake is off. Add an Anthropic API key in Settings to enable it.", disabled: true },
        { status: 503 }
      );
    }

    const b = await req.json().catch(() => null);
    const image = typeof b?.image === "string" ? b.image : "";
    if (!image) return badRequest("Take or attach a photo first");
    const parts = splitDataUrl(image);
    if (!parts) return badRequest("Unsupported image format — use JPEG, PNG, or WebP");
    if (parts.data.length * 0.75 > MAX_IMAGE_BYTES) return badRequest("Photo is too large (5MB max)");

    const context: string[] = [];
    if (typeof b.upc === "string" && b.upc.trim()) context.push(`Scanned UPC: ${b.upc.trim()}`);
    if (typeof b.hint === "string" && b.hint.trim()) context.push(`Known so far: ${b.hint.trim()}`);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: IDENTIFY_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: parts.mediaType, data: parts.data } },
              {
                type: "text",
                text: context.length
                  ? `${context.join("\n")}\n\nIdentify this item.`
                  : "Identify this item.",
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Surface the real reason (bad key, rate limit) instead of a generic 500.
      return NextResponse.json(
        { error: `Anthropic API error (${res.status})`, detail: detail.slice(0, 300) },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text = (data?.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("\n");

    const suggestion = parseSuggestion(text);
    if (!suggestion) {
      return NextResponse.json({ error: "Could not read a suggestion from the model", raw: text.slice(0, 300) }, { status: 502 });
    }
    return NextResponse.json({ suggestion });
  } catch (e) {
    return serverError(e);
  }
}
