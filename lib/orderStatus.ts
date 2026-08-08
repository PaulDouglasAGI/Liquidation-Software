import type { LotStatusValue, OrderStatusValue } from "./constants";

/**
 * Which moves are legal from each order state.
 *
 * Every forward step here has a way back, because every one of them gets made
 * by mistake: tracking pasted into the wrong row, "picked" ticked before
 * walking the shelf, the wrong order cancelled. Stranding someone in a state
 * they did not mean to reach — goods still on the shelf, system insisting they
 * are gone — is worse than the cost of an extra click back.
 *
 * Cancelling is still deliberately absent from SHIPPED. Unshipping is the undo
 * for a mis-click and keeps the sale; cancelling would erase a real sale from
 * P&L and put stock you no longer own back on the shelf. A parcel the buyer
 * genuinely sends back is a RETURN, recorded on the item.
 */
export const ALLOWED_ORDER_MOVES: Record<OrderStatusValue, OrderStatusValue[]> = {
  AWAITING_PICK: ["PICKED", "PACKED", "SHIPPED", "CANCELLED"],
  PICKED: ["AWAITING_PICK", "PACKED", "SHIPPED", "CANCELLED"],
  PACKED: ["AWAITING_PICK", "PICKED", "SHIPPED", "CANCELLED"],
  SHIPPED: ["PACKED"],
  CANCELLED: ["AWAITING_PICK"],
};

export function canMove(from: OrderStatusValue, to: OrderStatusValue): boolean {
  return from === to || ALLOWED_ORDER_MOVES[from].includes(to);
}

/** Why a move was refused, in words a picker can act on. */
export function refusalReason(from: OrderStatusValue, to: OrderStatusValue): string {
  if (from === "SHIPPED" && to === "CANCELLED") {
    return "This order has already shipped. Undo the shipment first, or record a return on the item if the buyer sent it back.";
  }
  return `Cannot move an order from ${from} to ${to}`;
}

/**
 * Which moves are legal for a bundle.
 *
 * Selling a bundle is one click that settles every unit in it, so selling the
 * wrong bundle — or the right one at the wrong price — is easy and expensive.
 * SOLD unwinds to LISTED, which reverses the settlement completely.
 *
 * CANCELLED stays terminal on purpose: it hands every unit back to stock
 * unchanged and the bundle is a couple of clicks to rebuild, so there is
 * nothing left to recover.
 */
export const ALLOWED_LOT_MOVES: Record<LotStatusValue, LotStatusValue[]> = {
  DRAFT: ["LISTED", "SOLD", "CANCELLED"],
  LISTED: ["DRAFT", "SOLD", "CANCELLED"],
  SOLD: ["LISTED"],
  CANCELLED: [],
};

export function canMoveLot(from: LotStatusValue, to: LotStatusValue): boolean {
  return from === to || ALLOWED_LOT_MOVES[from].includes(to);
}
