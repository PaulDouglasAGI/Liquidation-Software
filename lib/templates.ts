import { label } from "./constants";

export interface TemplateItem {
  sku: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  condition: string;
  conditionNotes?: string | null;
  msrp?: number | null;
  sellPrice?: number | null;
  weightLbs?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  serialNumber?: string | null;
  storageLocation?: string | null;
}

export const DEFAULT_TITLE_TEMPLATE = "{brand} {name} - {condition}";

export const DEFAULT_DESCRIPTION_TEMPLATE = `{brand} {name}

Condition: {condition}
{conditionNotes}

MSRP: {msrp}
SKU: {sku}

Sold by a small liquidation reseller. Item photos show the exact unit you will receive. Ships within 1 business day.`;

/** Render a listing template, substituting {tokens} with item fields. */
export function renderTemplate(template: string, item: TemplateItem): string {
  const dims =
    item.lengthIn && item.widthIn && item.heightIn
      ? `${item.lengthIn} x ${item.widthIn} x ${item.heightIn} in`
      : "";
  const tokens: Record<string, string> = {
    sku: item.sku,
    name: item.name,
    brand: item.brand ?? "",
    category: label(item.category),
    condition: label(item.condition),
    conditionNotes: item.conditionNotes ?? "",
    msrp: item.msrp ? `$${item.msrp.toFixed(2)}` : "",
    price: item.sellPrice ? `$${item.sellPrice.toFixed(2)}` : "",
    weight: item.weightLbs ? `${item.weightLbs} lbs` : "",
    dimensions: dims,
    serial: item.serialNumber ?? "",
  };
  return template
    .replace(/\{(\w+)\}/g, (_, key) => tokens[key] ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Formatted text block for manual Facebook Marketplace posting. */
export function facebookBlock(item: TemplateItem): string {
  const lines = [
    `${item.brand ? item.brand + " " : ""}${item.name}`,
    "",
    `Price: $${item.sellPrice?.toFixed(2) ?? "?"}`,
    `Condition: ${label(item.condition)}`,
  ];
  if (item.conditionNotes) lines.push(`Notes: ${item.conditionNotes}`);
  if (item.msrp) lines.push(`Retails for $${item.msrp.toFixed(2)}`);
  lines.push("", "Cash or electronic payment. Pickup or local delivery available.", `Ref: ${item.sku}`);
  return lines.join("\n");
}
