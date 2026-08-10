// String-literal mirrors of the Prisma enums, safe to import from client components.

export const PALLET_STATUSES = [
  "BIDDING",
  "WON",
  "RECEIVED",
  "IN_PROCESSING",
  "PARTIALLY_LISTED",
  "FULLY_LISTED",
  "CLOSED",
] as const;
export type PalletStatus = (typeof PALLET_STATUSES)[number];

export const CATEGORIES = [
  "POWER_TOOLS",
  "HAND_TOOLS",
  "HARDWARE",
  "ELECTRICAL_LIGHTING",
  "PLUMBING",
  "GENERAL_HOME",
  "APPLIANCES",
  "MIXED",
] as const;
export type ProductCategory = (typeof CATEGORIES)[number];

export {
  CONDITION_GRADES,
  DUD_REASONS,
  LABOR_ACTIVITIES,
  VALUE_CLASSES,
} from "./lotPerformanceMath";

export const CONDITIONS = ["NEW", "LIKE_NEW", "GOOD", "FAIR", "FOR_PARTS"] as const;
export type ItemCondition = (typeof CONDITIONS)[number];

export const ITEM_STATUSES = ["IN_STOCK", "LISTED", "RESERVED", "SOLD", "RETURNED", "SCRAPPED"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const PLATFORMS = ["EBAY", "AMAZON", "FACEBOOK", "OTHER"] as const;

/** Where a unit is advertised, as opposed to where a sale happened. */
export const LISTING_CHANNELS = ["EBAY", "AMAZON", "FACEBOOK", "OTHER"] as const;
export type ListingChannelValue = (typeof LISTING_CHANNELS)[number];
export type Platform = (typeof PLATFORMS)[number];

export const ORDER_STATUSES = ["AWAITING_PICK", "PICKED", "PACKED", "SHIPPED", "CANCELLED"] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const LOT_STATUSES = ["DRAFT", "LISTED", "SOLD", "CANCELLED"] as const;
export type LotStatusValue = (typeof LOT_STATUSES)[number];

export const ROLES = ["OWNER", "STAFF"] as const;
export type Role = (typeof ROLES)[number];

export const SUPPLIERS = ["Liquidation.com", "B-Stock", "Other"] as const;

export const LABELS: Record<string, string> = {
  OWNER: "Owner",
  STAFF: "Staff",
  RESERVED: "Reserved",
  AWAITING_PICK: "Awaiting Pick",
  PICKED: "Picked",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  CANCELLED: "Cancelled",
  DRAFT: "Draft",
  BIDDING: "Bidding",
  WON: "Won — not collected",
  RECEIVED: "Received",
  IN_PROCESSING: "In Processing",
  PARTIALLY_LISTED: "Partially Listed",
  FULLY_LISTED: "Fully Listed",
  CLOSED: "Closed",
  POWER_TOOLS: "Power Tools",
  HAND_TOOLS: "Hand Tools",
  HARDWARE: "Hardware",
  ELECTRICAL_LIGHTING: "Electrical / Lighting",
  PLUMBING: "Plumbing",
  GENERAL_HOME: "General Home",
  APPLIANCES: "Appliances",
  MIXED: "Mixed",
  NEW: "New",

  // Condition grades — how the seller graded the lot.
  SHELF_PULL: "Shelf Pull",
  OVERSTOCK: "Overstock",
  CUSTOMER_RETURNS: "Customer Returns",
  SALVAGE: "Salvage",

  // Labor
  PICKUP_TRANSPORT: "Pickup / Transport",
  TESTING_SORTING: "Testing / Sorting",
  PHOTOGRAPHING_LISTING: "Photos / Listing",
  PACKING_SHIPPING: "Packing / Shipping",

  // Unit classification
  FLOOR: "Floor",
  SPECULATIVE: "Speculative",
  NON_FUNCTIONAL: "Non-functional",
  MISSING_PARTS: "Missing parts",
  MISSING_BATTERY: "Missing battery",
  DAMAGED: "Damaged",
  NOT_AS_MANIFESTED: "Not as manifested",
  LIKE_NEW: "Like New",
  GOOD: "Good",
  FAIR: "Fair",
  FOR_PARTS: "For Parts",
  IN_STOCK: "In Stock",
  LISTED: "Listed",
  SOLD: "Sold",
  RETURNED: "Returned",
  SCRAPPED: "Scrapped",
  EBAY: "eBay",
  AMAZON: "Amazon",
  FACEBOOK: "Facebook",
  OTHER: "Other",
};

export const label = (v: string | null | undefined) => (v ? LABELS[v] ?? v : "—");

export const STATUS_COLORS: Record<string, string> = {
  IN_STOCK: "text-zinc-300",
  LISTED: "text-amber-400",
  SOLD: "text-green-500",
  RETURNED: "text-red-400",
  SCRAPPED: "text-zinc-500",
  RECEIVED: "text-zinc-300",
  IN_PROCESSING: "text-amber-400",
  PARTIALLY_LISTED: "text-amber-400",
  FULLY_LISTED: "text-green-500",
  CLOSED: "text-zinc-500",
};
