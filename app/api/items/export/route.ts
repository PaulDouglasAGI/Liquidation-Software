import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiUser, unauthorized } from "@/lib/api";
import { buildItemWhere } from "@/lib/itemFilters";
import { getSettingNum } from "@/lib/settings";
import { csvResponse, toCsv } from "@/lib/csv";
import { daysSince, localDateStr } from "@/lib/format";

export async function GET(req: NextRequest) {
  if (!(await apiUser())) return unauthorized();
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const agingDays = await getSettingNum("agingDays");
  const items = await prisma.item.findMany({
    where: buildItemWhere(params, agingDays),
    include: { pallet: { select: { palletCode: true } } },
    orderBy: { sku: "asc" },
  });

  const csv = toCsv(
    ["SKU", "UPC", "Name", "Brand", "Category", "Condition", "MSRP", "Cost", "List Price", "Sold Price", "Fees", "Shipping", "Status", "Platform", "Location", "Pallet", "Date Listed", "Date Sold", "Days Listed", "Order ID"],
    items.map((i) => [
      i.sku,
      i.upc,
      i.name,
      i.brand,
      i.category,
      i.condition,
      i.msrp?.toFixed(2),
      i.ourCost.toFixed(2),
      i.sellPrice?.toFixed(2),
      i.soldPrice?.toFixed(2),
      i.feesAmount?.toFixed(2),
      i.shippingCost?.toFixed(2),
      i.status,
      i.platform,
      i.storageLocation,
      i.pallet.palletCode,
      localDateStr(i.dateListed),
      localDateStr(i.dateSold),
      i.status === "LISTED" ? daysSince(i.dateListed) : null,
      i.orderId,
    ])
  );
  return csvResponse(`inventory-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
