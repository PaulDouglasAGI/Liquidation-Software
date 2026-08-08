import { describe, expect, it } from "vitest";
import { ALLOWED_ORDER_MOVES, canMove, refusalReason } from "@/lib/orderStatus";
import { ORDER_STATUSES, type OrderStatusValue } from "@/lib/constants";

describe("order state machine — a warehouse mis-clicks, and must be able to take it back", () => {
  it("walks the normal path forwards", () => {
    expect(canMove("AWAITING_PICK", "PICKED")).toBe(true);
    expect(canMove("PICKED", "PACKED")).toBe(true);
    expect(canMove("PACKED", "SHIPPED")).toBe(true);
  });

  it("walks every forward step back again", () => {
    // Each of these was a dead end. Ticking "picked" early, or pasting a
    // tracking number into the wrong row, left no way back through the UI.
    expect(canMove("PICKED", "AWAITING_PICK")).toBe(true);
    expect(canMove("PACKED", "PICKED")).toBe(true);
    expect(canMove("SHIPPED", "PACKED")).toBe(true);
    expect(canMove("CANCELLED", "AWAITING_PICK")).toBe(true);
  });

  it("leaves no state a mistake can strand an order in", () => {
    for (const s of ORDER_STATUSES) {
      expect(ALLOWED_ORDER_MOVES[s].length).toBeGreaterThan(0);
    }
  });

  it("still refuses to cancel a shipment, which would erase a real sale", () => {
    expect(canMove("SHIPPED", "CANCELLED")).toBe(false);
    // ...and says what to do instead, rather than just refusing.
    expect(refusalReason("SHIPPED", "CANCELLED")).toMatch(/undo the shipment/i);
    expect(refusalReason("SHIPPED", "CANCELLED")).toMatch(/return/i);
  });

  it("routes a shipped order back to the queue only through PACKED", () => {
    // Straight to AWAITING_PICK would wipe the pick and pack that really did
    // happen; the parcel exists, it just has not left.
    expect(ALLOWED_ORDER_MOVES.SHIPPED).toEqual(["PACKED"]);
  });

  it("treats a no-op move as allowed so re-saving details never 400s", () => {
    for (const s of ORDER_STATUSES) expect(canMove(s, s)).toBe(true);
  });

  it("every destination is a real status", () => {
    const all = Object.values(ALLOWED_ORDER_MOVES).flat();
    for (const s of all) {
      expect(ORDER_STATUSES as readonly string[]).toContain(s);
    }
  });

  it("every state is reachable from somewhere", () => {
    const reachable = new Set(Object.values(ALLOWED_ORDER_MOVES).flat());
    for (const s of ORDER_STATUSES) {
      if (s === "AWAITING_PICK") continue; // where orders start
      expect(reachable.has(s as OrderStatusValue)).toBe(true);
    }
  });
});
