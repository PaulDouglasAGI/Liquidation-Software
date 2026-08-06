# Liquidation Ops Platform

Operations platform for a small liquidation resale team: buy power-tool / home-improvement pallets from Liquidation.com and B-Stock, intake and grade every item, price it, list it on eBay / Amazon / Facebook Marketplace, and track P&L through the whole lifecycle.

**Pallet intake → item intake (barcode scan) → condition grading → pricing → listing → sold → P&L.**

No config files or terminal accounts needed to get going: the **first visit in the browser opens a setup wizard** that creates your account and sensible defaults. On a phone, the app is **installable** (browser menu → "Add to Home Screen") and runs full-screen like a native app, including camera barcode scanning.

---

## Quick start — pick your path

### A) GitHub Codespaces — nothing to install, runs in your browser

The fastest way to try it. On the repo page: **Code ▸ Codespaces ▸ Create codespace**
(pick the branch that contains `.devcontainer/`).

VS Code opens in your browser and does the rest — installs Node and PostgreSQL,
sets up the database, and starts the dev server. First build takes a few
minutes; after that the app opens in a new browser tab (or use the **PORTS**
tab and click the 🌐 globe next to port 3000).

> **Getting `HTTP ERROR 502`?** The app is almost certainly running fine — the
> request just isn't reaching it. Open the **PORTS** tab, right-click port 3000,
> and set **Port Visibility → Public**. Always open the app with the 🌐 globe
> icon on that row rather than a saved URL: each Codespace gets a new hostname,
> and an old URL keeps resolving but forwards nowhere. `npm run doctor` will
> tell you whether the server itself is up.

> Open it in a **real browser tab**, not VS Code's built-in preview pane. The
> preview renders the app in a cross-site iframe, and browsers will not send a
> `SameSite=Lax` session cookie into one — you would sign in and land straight
> back on the login page. The globe icon in the PORTS tab always opens a proper
> tab.

The first visit walks you through creating your account. Everything you enter
lives in the Codespace's own database and persists across stops and restarts.

```bash
npm run dev      # if you ever need to start the server by hand
npm test         # run the test suite
npm run repair   # if anything gets wedged: reinstalls deps, keeps your data
```

> Codespaces is free for personal accounts up to a monthly quota, then billed by
> the hour — **stop the Codespace when you're done** (Code ▸ Codespaces ▸ ⋯ ▸ Stop).
> Your data is still there next time you start it.

This same setup works in desktop VS Code too: install the **Dev Containers**
extension, open the folder, and choose **Reopen in Container**.

### B) Android phone, free, self-contained (Termux)

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

### C) Docker (a real server, home PC, or NAS — one command)

```bash
git clone https://github.com/PaulDouglasAGI/Liquidation-Software.git
cd Liquidation-Software
docker compose up -d
```

Open **http://localhost:3000** → setup wizard. Postgres, migrations, photo storage: all handled; data persists in Docker volumes.

### D) Bare metal (any Linux/macOS box with Node 18+ and PostgreSQL)

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

### Roles

The account created by the setup wizard is the **owner**. Everyone added
afterwards defaults to **staff**, and you can change roles any time in
**Settings → Team members**.

| | Owner | Staff |
|---|---|---|
| Pallets, intake, listing, sales, returns, P&L, insights | ✅ | ✅ |
| Pricing / aging / fee-rate settings | ✅ | ✅ |
| Add, remove, and re-role team members | ✅ | — |
| eBay / Amazon / UPC API credentials | ✅ | — |
| Restore a backup (replaces all business data) | ✅ | — |

The app will not let you delete or demote the last owner, so an install can
never lock itself out. Repeated failed sign-ins are rate-limited per account
and per IP.

## Modules

| Module | Where | Notes |
|---|---|---|
| Dashboard | `/` | Today's sales/profit, active inventory, pallet ROI table, weekly revenue/profit bars, sell-through by category, top margins, aging / unlisted / low-margin alerts |
| Pallet intake | `/pallets` | Auto pallet codes (`PAL-2026-001`), status lifecycle auto-updates from item states, per-pallet ROI, "reallocate cost/item", **manifest CSV import** (map the columns of a Liquidation.com / B-Stock manifest, quantities expand to individual items, cost auto-spread) |
| Item intake | `/intake` | Mobile-first: camera barcode scan, UPC auto-lookup, big tap targets, **Save ×N** for identical units, **continuous scan mode** (camera reopens after each save), multi-photo with thumbnails, **offline queue** (scans queue locally and sync on reconnect) |
| Scan-to-find | everywhere | The SCAN button in the sidebar reads any SKU label or product UPC and jumps straight to the item |
| Inventory | `/inventory` | Debounced search, filters (pallet/category/condition/status/platform/date/price/aging), sortable, paginated, inline edit of price/status/location, bulk actions (mark sold, relist, change location, scrap, reprice by % of MSRP / % off / $ off), CSV export |
| Item detail | `/items/[id]` | Full editor, live margin calc, eBay Market Check, one-click eBay listing push, Amazon flat-file export, Facebook text-block export, photo management, print label |
| Barcode labels | `/labels` | Printable Code 128 SKU labels (2.25"×1.25", thermal- and paper-friendly) — single item or bulk from the inventory selection; scanning a label finds the item |
| Insights | `/insights` | Days-to-sell and MSRP-recovery by category and brand, monthly trend, return rate, and **smart repricing**: suggested cuts for aging listings (10%/20%, never below cost) applied in one click |
| Lot Performance | `/performance` | The labor-aware view of what a lot actually earned. Five metrics per lot — **profit per labor hour**, dud rate (by reason), sell-through at 30/60/90 days from pickup, days from pickup to first listing, and estimate accuracy (actual recovery ÷ your pre-bid estimate). `/performance/insights` rolls them up by lot category and condition grade to answer "what should we buy next?". A persistent **Log hours** button on every screen records a work session in about three taps. **Lot cost is never allocated to individual units** — manifest retail is too unreliable to split from, so profit is measured against the whole lot and nothing else. (The separate per-item "reallocate cost/item" on a pallet feeds the older per-item P&L views only; Lot Performance ignores it.) |
| Activity | `/activity` | Team audit trail — intake, status changes, imports, listings, restores; who did what, when |
| P&L | `/pnl` | Date presets + custom range, group by pallet/category/platform/day/week/month — **net of platform fees and shipping** (rates configurable in Settings, stamped on each sale, editable per item), plus expenses, CSV export |
| Suppliers | `/suppliers` | Purchase log per supplier + ROI per supplier derived from pallet records |
| Settings | `/settings` | Pricing formula, aging threshold, low-margin alert, eBay/Amazon/UPC credentials, listing templates, storage locations, team members, **one-click full backup and restore** (move a phone install to a server in two clicks) |

### Keyboard shortcuts (desktop)

`N` new item (intake) · `I` inventory · `P` pallets · `G` insights · `R` lot performance · `D` dashboard · `L` P&L · `U` suppliers · `/` focus search · `S` save (item editor)

### Returns

Set an item's status to **Returned** to reverse the sale (it leaves revenue immediately); record the reason on the item, then either relist it or scrap it. Return rate is tracked on the Insights page.

## Integrations

- **UPC lookup** — upcitemdb.com trial endpoint works with no key; add a key in Settings for the paid tier.
- **eBay: Connect with a button** — save your keyset (App ID, Cert ID, Dev ID, RuName) once in Settings, point the RuName's "auth accepted URL" at `/api/ebay/oauth/callback`, click **Connect eBay account**, approve — done. Tokens refresh automatically; nothing to paste or renew. (A legacy manual Auth Token still works as a fallback.)
- **eBay order sync** — the "Sync eBay orders" button (dashboard and Settings) pulls recent orders and marks matching items sold with the real price, order ID, and eBay's actual fee. For hands-free syncing, point a cron at it: `curl -X POST https://your-app/api/ebay/sync-orders -H "X-Webhook-Secret: $WEBHOOK_SECRET"`
- **Bulk listing** — select items in Inventory → "Push to eBay (N)" lists them all sequentially with per-item results (max 25 per push).
- **eBay Market Check** — uses the Marketplace Insights API for true 90-day sold prices when your keyset has access, otherwise falls back to Browse API active listings and labels the result accordingly.
- **eBay listing push** — Trading API `AddFixedPriceItem` via the OAuth connection. Photos are passed as public URLs, so the app must be reachable from the internet for pictures to attach.
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
npm test           # unit tests (vitest) — also run in CI on every push
npm run db:migrate # prisma migrate dev
npm run db:deploy  # prisma migrate deploy (production)
npm run db:seed    # optional: seed defaults, dev admin (SEED_ADMIN_EMAIL), demo data (SEED_DEMO=1)
npm run db:studio  # prisma studio
```

## Good to know

- **Camera scanning needs a secure origin** — `http://localhost` counts (that's why the on-phone Termux setup works), otherwise serve over HTTPS.
- Item photos live on disk (`LOCAL_UPLOAD_PATH`, `/data/uploads` volume under Docker) — back that up along with the database.
- This is single-tenant software: one deployment = one business. Everyone with a login sees everything, by design.
