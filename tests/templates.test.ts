import { describe, expect, it } from "vitest";
import { renderTemplate, facebookBlock, DEFAULT_TITLE_TEMPLATE } from "@/lib/templates";

const item = {
  sku: "ITM-PAL001-001",
  name: "20V MAX Cordless Drill",
  brand: "DeWalt",
  category: "POWER_TOOLS",
  condition: "LIKE_NEW",
  conditionNotes: "Open box",
  msrp: 169,
  sellPrice: 84.5,
  weightLbs: 3.5,
  lengthIn: 12,
  widthIn: 4,
  heightIn: 9,
  serialNumber: null,
};

describe("renderTemplate", () => {
  it("substitutes tokens with human labels", () => {
    expect(renderTemplate(DEFAULT_TITLE_TEMPLATE, item)).toBe("DeWalt 20V MAX Cordless Drill - Like New");
  });

  it("formats money, weight, and dimensions", () => {
    const out = renderTemplate("{msrp}|{price}|{weight}|{dimensions}", item);
    expect(out).toBe("$169.00|$84.50|3.5 lbs|12 x 4 x 9 in");
  });

  it("drops unknown tokens and collapses blank lines", () => {
    const out = renderTemplate("A\n\n\n\n{nosuchtoken}\n\nB", { ...item, conditionNotes: null });
    expect(out).toBe("A\n\nB");
  });
});

describe("facebookBlock", () => {
  it("includes price, condition, MSRP anchor, and SKU reference", () => {
    const out = facebookBlock(item);
    expect(out).toContain("Price: $84.50");
    expect(out).toContain("Condition: Like New");
    expect(out).toContain("Retails for $169.00");
    expect(out).toContain("Ref: ITM-PAL001-001");
  });
});
