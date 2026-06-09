# Liquidation Ops Platform

Operations platform for a small liquidation resale team: buy power-tool / home-improvement pallets from Liquidation.com and B-Stock, intake and grade every item, price it, list it on eBay / Amazon / Facebook Marketplace, and track P&L through the whole lifecycle.

**Pallet intake → item intake (barcode scan) → condition grading → pricing → listing → sold → P&L.**

## Stack

- **Next.js (App Router) + React + Tailwind CSS** — single full-stack app
- **PostgreSQL + Prisma ORM**
- **Session auth** (DB-backed sessions, bcrypt passwords; everyone sees everything)
- **html5-qrcode** — phone-camera barcode scanning in the browser
- **Local filesystem** photo storage (`LOCAL_UPLOAD_PATH`)

## Quick start

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL at minimum
npx prisma migrate deploy   # or `npm run db:migrate` in development
npm run db:seed             # creates admin user, default templates/settings
npm run dev                 # http://localhost:3000
```

Default login (change via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` before seeding): `admin@local` / `admin123`.

Set `SEED_DEMO=1` before seeding to load two demo pallets with items so you can explore the dashboard.

## Modules

| Module | Where | Notes |
|---|---|---|
| Dashboard | `/` | Today's sales/profit, active inventory, pallet ROI table, weekly revenue/profit bars, sell-through by category, top margins, aging / unlisted / low-margin alerts |
| Pallet intake | `/pallets` | Auto pallet codes (`PAL-2026-001`), status lifecycle auto-updates from item states, per-pallet ROI, "reallocate cost/item" |
| Item intake | `/intake` | Mobile-first: camera barcode scan, UPC auto-lookup (upcitemdb.com), big tap targets, photo upload, **offline queue** (scans queue in localStorage and sync on reconnect) |
| Inventory | `/inventory` | Debounced search, filters (pallet/category/condition/status/platform/date/price/aging), sortable, paginated (50/page), inline edit of price/status/location, bulk actions (mark sold, relist, change location, scrap, reprice by % of MSRP / % off / $ off), CSV export |
| Item detail | `/items/[id]` | Full editor, live margin calc, eBay Market Check, one-click eBay listing push, Amazon flat-file export, Facebook text-block export, photo management (8 max) |
| P&L | `/pnl` | Date presets + custom range, group by pallet/category/platform/day/week/month, revenue / COGS / gross / margin / expenses / net, expense tracking, CSV export |
| Suppliers | `/suppliers` | Purchase log per supplier + ROI per supplier derived from pallet records |
| Settings | `/settings` | Pricing formula (% of MSRP), aging threshold, low-margin alert, eBay/Amazon/UPC credentials, per-category listing templates, storage location codes, team members |

### Keyboard shortcuts (desktop)

`N` new item (intake) · `I` inventory · `P` pallets · `D` dashboard · `L` P&L · `U` suppliers · `/` focus search · `S` save (item editor)

## Integrations

- **UPC lookup** — upcitemdb.com trial endpoint works with no key; add `UPC_API_KEY` (or save it in Settings) for the paid tier.
- **eBay Market Check** — needs `EBAY_APP_ID` + `EBAY_CERT_ID` (OAuth client-credentials). Uses the Marketplace Insights API for true 90-day sold prices when your keyset has access, otherwise falls back to Browse API active listings and labels the result accordingly.
- **eBay listing push** — Trading API `AddFixedPriceItem`; needs App ID, Cert ID, Dev ID, and a user Auth Token. Photos are passed as public URLs, so the app must be reachable from the internet for pictures to attach.
- **eBay sold events** — `POST /api/webhooks/ebay` with `{ "listingId": "...", "soldPrice": 99.99, "orderId": "..." }` (point Platform Notifications or a polling cron at it) marks the matching item sold automatically.
- **Amazon** — generates an inventory-loader flat file (TSV) for Seller Central upload. Direct SP-API push intentionally returns a clear error until an approved SP-API app + LWA refresh token is wired in.
- **Facebook Marketplace** — no public API; the app generates a formatted post text block (auto-copied to clipboard) plus photo URLs for manual posting.

Credentials can be supplied as environment variables or saved in **Settings** (DB values take precedence; the UI shows whether each credential comes from `env`, `saved`, or is missing).

## Environment variables

See [.env.example](.env.example). Only `DATABASE_URL` and `SESSION_SECRET` are required to run; everything else degrades gracefully with actionable error messages.

## Scripts

```bash
npm run dev        # dev server
npm run build      # production build
npm run start      # production server
npm run lint       # eslint
npm run db:migrate # prisma migrate dev
npm run db:deploy  # prisma migrate deploy (production)
npm run db:seed    # seed admin user + defaults (+ demo data when SEED_DEMO=1)
npm run db:studio  # prisma studio
```
