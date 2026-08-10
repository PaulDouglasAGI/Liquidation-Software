import { describe, expect, it } from "vitest";
import { AUTO_ENDABLE, type Channel } from "@/lib/listings";
import { LISTING_CHANNELS } from "@/lib/constants";

/**
 * The oversell rule, stated once.
 *
 * A unit advertised on eBay, Amazon and Facebook at the same time that sells on
 * one leaves two adverts live. The next buyer pays for stock already in someone
 * else's box: a refund, the postage both ways, and a defect on the seller
 * account. What this file pins down is which channels the software can close by
 * itself and which it must hand to a person — because silently assuming it can
 * close all of them is exactly how the advert stays up.
 */
describe("which channels can be closed without a human", () => {
  it("knows eBay has an API and the others do not", () => {
    expect(AUTO_ENDABLE.EBAY).toBe(true);
    // Amazon here is a flat file someone uploads; Facebook Marketplace is a
    // text block someone pastes. Neither can be ended from code.
    expect(AUTO_ENDABLE.AMAZON).toBe(false);
    expect(AUTO_ENDABLE.FACEBOOK).toBe(false);
    expect(AUTO_ENDABLE.OTHER).toBe(false);
  });

  it("has an answer for every channel the schema allows", () => {
    for (const c of LISTING_CHANNELS) {
      expect(AUTO_ENDABLE[c as Channel], `no takedown rule for ${c}`).toBeDefined();
    }
  });

  it("fails closed — an unknown channel is never assumed automatic", () => {
    expect(AUTO_ENDABLE["SOMETHING_NEW" as Channel]).toBeFalsy();
  });
});
