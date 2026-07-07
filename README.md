# Liquidation Ops Platform

Operations platform for a small liquidation resale team: buy power-tool / home-improvement pallets from Liquidation.com and B-Stock, intake and grade every item, price it, list it on eBay / Amazon / Facebook Marketplace, and track P&L through the whole lifecycle.

**Pallet intake → item intake (barcode scan) → condition grading → pricing → listing → sold → P&L.**

No config files or terminal accounts needed to get going: the **first visit in the browser opens a setup wizard** that creates your account and sensible defaults. On a phone, the app is **installable** (browser menu → "Add to Home Screen") and runs full-screen like a native app, including camera barcode scanning.

---

## Quick start — pick your path

### A) Android phone, free, self-contained (Termux)

Install [Termux from F-Droid](https://f-droid.org/en/packages/com.termux/), open it, and run:

```bash
curl -fsSL https://raw.githubusercontent.com/PaulDouglasAGI/Liquidation-Software/main/scripts/termux-install.sh | bash
```

That single command installs a tiny Ubuntu inside Termux, sets up Node + PostgreSQL, builds the app, and creates a launcher. From then on:

```bash
liqops          # start the app
```

Open **http://localhost:3000** in Chrome, create your account in the wizard, and use Chrome menu → **Add to Home Screen** to get an app icon. Everything runs and stays on your phone.

> If the GitHub repo is private, the installer will ask you to paste a GitHub token so it can download the code.

### B) Docker (a real server, home PC, or NAS — one command)

```bash
git clone https://github.com/PaulDouglasAGI/Liquidation-Software.git
cd Liquidation-Software
docker compose up -d
```

Open **http://localhost:3000** → setup wizard. Postgres, migrations, photo storage: all handled; data persists in Docker volumes.

### C) Bare metal (any Linux/macOS box with Node 18+ and PostgreSQL)

```bash
git clone https://github.com/PaulDouglasAGI/Liquidation-Software.git
cd Liquidation-Software
npm run setup        # creates .env, DB, migrations, build — with friendly errors
npm run start
```

---

## First run

1. Open the app → you land on the **setup wizard**.
2. Enter your name, email, and a password → you're logged in as the owner.
3. Pricing defaults (50% of MSRP), listing templates, and starter shelf codes are created automatically.
4. Add teammates in **Settings → Team members**; everyone shares the same inventory.
5. Create your first pallet, hit **Item Intake** on your phone, and start scanning.

## Modules

| Module | Where | Notes |
|---|---|---|
| Dashboard | `/` | Today's sales/profit, active inventory, pallet ROI table, weekly revenue/profit bars, sell-through by category, top margins, aging / unlisted / low-margin alerts |
| Pallet intake | `/pallets` | Auto pallet codes (`PAL-2026-001`), status lifecycle auto-updates from item states, per-pallet ROI, "reallocate cost/item", **manifest CSV import** (map the columns of a Liquidation.com / B-Stock manifest, quantities expand to individual items, cost auto-spread) |
| Item intake | `/intake` | Mobile-first: camera barcode scan, UPC auto-lookup (upcitemdb.com), big tap targets, photo upload, **offline queue** (scans queue locally and sync on reconnect) |
| Inventory | `/inventory` | Debounced search, filters (pallet/category/condition/status/platform/date/price/aging), sortable, paginated, inline edit of price/status/location, bulk actions (mark sold, relist, change location, scrap, reprice by % of MSRP / % off / $ off), CSV export |
| Item detail | `/items/[id]` | Full editor, live margin calc, eBay Market Check, one-click eBay listing push, Amazon flat-file export, Facebook text-block export, photo management, print label |
| Barcode labels | `/labels` | Printable Code 128 SKU labels (2.25"×1.25", thermal- and paper-friendly) — single item or bulk from the inventory selection; scanning a label finds the item |
| P&L | `/pnl` | Date presets + custom range, group by pallet/category/platform/day/week/month, revenue / COGS / gross / margin / expenses / net, CSV export |
| Suppliers | `/suppliers` | Purchase log per supplier + ROI per supplier derived from pallet records |
| Settings | `/settings` | Pricing formula, aging threshold, low-margin alert, eBay/Amazon/UPC credentials, listing templates, storage locations, team members, **one-click full backup** (JSON, credentials excluded) |

### Keyboard shortcuts (desktop)

`N` new item (intake) · `I` inventory · `P` pallets · `D` dashboard · `L` P&L · `U` suppliers · `/` focus search · `S` save (item editor)

## Integrations

- **UPC lookup** — upcitemdb.com trial endpoint works with no key; add a key in Settings for the paid tier.
- **eBay Market Check** — needs App ID + Cert ID (enter them in Settings). Uses the Marketplace Insights API for true 90-day sold prices when your keyset has access, otherwise falls back to Browse API active listings and labels the result accordingly.
- **eBay listing push** — Trading API `AddFixedPriceItem`; needs App ID, Cert ID, Dev ID, and a user Auth Token. Photos are passed as public URLs, so the app must be reachable from the internet for pictures to attach.
- **eBay sold events** — `POST /api/webhooks/ebay` with `{ "listingId": "...", "soldPrice": 99.99, "orderId": "..." }` marks the matching item sold automatically. Requires `WEBHOOK_SECRET` to be set and sent as the `X-Webhook-Secret` header — the endpoint refuses to act without it (eBay item IDs are public, so an open endpoint would let anyone rewrite your sales).
- **Amazon** — generates an inventory-loader flat file (TSV) for Seller Central upload. Direct SP-API push intentionally returns a clear error until an approved SP-API app + LWA refresh token is wired in.
- **Facebook Marketplace** — no public API; the app generates a formatted post text block (auto-copied to clipboard) plus photo URLs for manual posting.

All credentials can be entered in **Settings** inside the app — no config-file editing required. Environment variables work too (Settings values win).

## Environment variables

See [.env.example](.env.example). `DATABASE_URL` is the only required one — Docker compose and the installers set it for you.

## Scripts

```bash
npm run setup      # one-command setup (env, db, migrations, build)
npm run dev        # dev server
npm run build      # production build
npm run start      # production server
npm run lint       # eslint
npm run db:migrate # prisma migrate dev
npm run db:deploy  # prisma migrate deploy (production)
npm run db:seed    # optional: seed defaults, dev admin (SEED_ADMIN_EMAIL), demo data (SEED_DEMO=1)
npm run db:studio  # prisma studio
```

## Good to know

- **Camera scanning needs a secure origin** — `http://localhost` counts (that's why the on-phone Termux setup works), otherwise serve over HTTPS.
- Item photos live on disk (`LOCAL_UPLOAD_PATH`, `/data/uploads` volume under Docker) — back that up along with the database.
- This is single-tenant software: one deployment = one business. Everyone with a login sees everything, by design.
