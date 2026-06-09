import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_DESCRIPTION = `{brand} {name}

Condition: {condition}
{conditionNotes}

MSRP: {msrp}
SKU: {sku}

Sold by a small liquidation reseller. Item photos show the exact unit you will receive. Ships within 1 business day.`;

async function main() {
  // Admin user
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Admin", passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`Admin user ready: ${email}`);

  // Default settings
  for (const [key, value] of Object.entries({
    defaultPricePct: "50",
    agingDays: "30",
    lowMarginPct: "20",
  })) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  // Listing template per category
  for (const category of ["POWER_TOOLS", "HAND_TOOLS", "HARDWARE", "APPLIANCES", "MIXED"] as const) {
    await prisma.listingTemplate.upsert({
      where: { category },
      update: {},
      create: {
        category,
        titleTemplate: "{brand} {name} - {condition}",
        descriptionTemplate: DEFAULT_DESCRIPTION,
      },
    });
  }

  // Starter shelf codes
  for (const code of ["SHELF-A1", "SHELF-A2", "SHELF-A3", "SHELF-B1", "SHELF-B2", "FLOOR-1"]) {
    await prisma.storageLocation.upsert({ where: { code }, update: {}, create: { code } });
  }

  if (process.env.SEED_DEMO === "1") {
    await seedDemo();
  }
}

async function seedDemo() {
  if (await prisma.pallet.count()) {
    console.log("Demo skipped: pallets already exist");
    return;
  }
  const year = new Date().getFullYear();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  const p1 = await prisma.pallet.create({
    data: {
      palletCode: `PAL-${year}-001`,
      supplier: "Liquidation.com",
      purchaseDate: daysAgo(45),
      totalCost: 1450,
      category: "POWER_TOOLS",
      status: "PARTIALLY_LISTED",
      notes: "DeWalt/Milwaukee returns pallet, manifest matched ~90%",
    },
  });
  const p2 = await prisma.pallet.create({
    data: {
      palletCode: `PAL-${year}-002`,
      supplier: "B-Stock",
      purchaseDate: daysAgo(12),
      totalCost: 820,
      category: "MIXED",
      status: "IN_PROCESSING",
    },
  });

  type Demo = [string, string | null, string, number, number, string, string, Partial<{
    status: "IN_STOCK" | "LISTED" | "SOLD";
    platform: "EBAY" | "AMAZON" | "FACEBOOK";
    soldPrice: number;
    listedDaysAgo: number;
    soldDaysAgo: number;
    location: string;
  }>];
  const demo1: Demo[] = [
    ["DeWalt 20V MAX Cordless Drill DCD771C2", "885911475693", "DeWalt", 169, 85, "LIKE_NEW", "POWER_TOOLS", { status: "SOLD", platform: "EBAY", soldPrice: 92, listedDaysAgo: 40, soldDaysAgo: 33 }],
    ["Milwaukee M18 FUEL Impact Driver 2853-20", "045242509721", "Milwaukee", 199, 110, "GOOD", "POWER_TOOLS", { status: "SOLD", platform: "EBAY", soldPrice: 118, listedDaysAgo: 38, soldDaysAgo: 20 }],
    ["Makita 18V LXT Circular Saw XSS02Z", "088381665872", "Makita", 159, 80, "GOOD", "POWER_TOOLS", { status: "LISTED", platform: "EBAY", listedDaysAgo: 36, location: "SHELF-A1" }],
    ["DeWalt 20V MAX Reciprocating Saw DCS367B", "885911531030", "DeWalt", 219, 105, "LIKE_NEW", "POWER_TOOLS", { status: "LISTED", platform: "EBAY", listedDaysAgo: 8, location: "SHELF-A1" }],
    ["Milwaukee M12 3/8 Ratchet 2457-20", "045242214089", "Milwaukee", 149, 79, "FAIR", "POWER_TOOLS", { status: "LISTED", platform: "FACEBOOK", listedDaysAgo: 34, location: "SHELF-A2" }],
    ["Ryobi ONE+ 18V 6-Tool Combo Kit", "033287189434", "Ryobi", 299, 140, "GOOD", "POWER_TOOLS", { status: "SOLD", platform: "FACEBOOK", soldPrice: 165, listedDaysAgo: 30, soldDaysAgo: 1 }],
    ["Bosch 12V Max Drill/Driver PS31-2A", "000346471585", "Bosch", 119, 55, "GOOD", "POWER_TOOLS", { status: "IN_STOCK", location: "SHELF-A3" }],
    ["DeWalt ToughSystem Tool Box DWST08204", "076174753745", "DeWalt", 99, 45, "NEW", "HARDWARE", { status: "SOLD", platform: "EBAY", soldPrice: 61, listedDaysAgo: 25, soldDaysAgo: 0 }],
  ];
  const demo2: Demo[] = [
    ["Stanley 65-Piece Homeowner's Tool Kit", "076174958072", "Stanley", 49, 18, "NEW", "HAND_TOOLS", { status: "LISTED", platform: "EBAY", listedDaysAgo: 5, location: "SHELF-B1" }],
    ["Honeywell Tower Fan HYF290B", "092926001827", "Honeywell", 79, 25, "GOOD", "APPLIANCES", { status: "SOLD", platform: "AMAZON", soldPrice: 42, listedDaysAgo: 9, soldDaysAgo: 0 }],
    ["Black+Decker Toaster Oven TO3250XSB", "050875806702", "Black+Decker", 69, 22, "LIKE_NEW", "APPLIANCES", { status: "IN_STOCK", location: "SHELF-B2" }],
    ["Kwikset SmartCode 270 Deadbolt", "883351531234", "Kwikset", 89, 28, "NEW", "HARDWARE", { status: "LISTED", platform: "EBAY", listedDaysAgo: 3, location: "SHELF-B1" }],
    ["GE 5000 BTU Window AC Unit", "084691844274", "GE", 179, 60, "FAIR", "APPLIANCES", { status: "IN_STOCK", location: "FLOOR-1" }],
    ["Craftsman 230-Piece Mechanics Tool Set", "885911594691", "Craftsman", 189, 65, "GOOD", "HAND_TOOLS", { status: "LISTED", platform: "EBAY", listedDaysAgo: 2, location: "SHELF-B2" }],
  ];

  let n = 0;
  for (const [pallet, list, palSeq] of [
    [p1, demo1, "001"],
    [p2, demo2, "002"],
  ] as const) {
    n = 0;
    for (const [name, upc, brand, msrp, cost, condition, category, extra] of list) {
      n += 1;
      const status = extra.status ?? "IN_STOCK";
      await prisma.item.create({
        data: {
          sku: `ITM-PAL${palSeq}-${String(n).padStart(3, "0")}`,
          palletId: pallet.id,
          upc: upc?.replace(/\D/g, "") || null,
          name,
          brand,
          category: category as never,
          condition: condition as never,
          msrp,
          ourCost: cost,
          sellPrice: Math.round(msrp * 0.5),
          soldPrice: extra.soldPrice,
          storageLocation: extra.location,
          status: status as never,
          platform: extra.platform as never,
          dateListed: extra.listedDaysAgo !== undefined ? daysAgo(extra.listedDaysAgo) : undefined,
          dateSold: extra.soldDaysAgo !== undefined ? daysAgo(extra.soldDaysAgo) : undefined,
        },
      });
    }
  }

  await prisma.expense.createMany({
    data: [
      { date: daysAgo(20), category: "Shipping supplies", description: "Boxes + bubble wrap", amount: 64.5 },
      { date: daysAgo(10), category: "Platform fees", description: "eBay store subscription", amount: 27.95 },
    ],
  });

  await prisma.supplierPurchase.createMany({
    data: [
      { supplierName: "Liquidation.com", purchaseDate: daysAgo(45), manifestId: "LQ-88231", category: "Power Tools", palletsBought: 1, totalPaid: 1450 },
      { supplierName: "B-Stock", purchaseDate: daysAgo(12), manifestId: "BS-2241", category: "Mixed", palletsBought: 1, totalPaid: 820 },
    ],
  });

  console.log("Demo data seeded");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
