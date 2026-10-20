# Aarzu · آرزو

Shalwar kameez storefront for women and men: a Designer Edit of big-brand suits priced Rs 1,000 under retail, plus our own **Aarzu Originals** inspired by the crafts of Pakistan. Western wear is shown as *coming soon* with a waitlist.

## Hostinger Single / Premium — same site and features, using PHP

Upload the repository contents to `public_html/`, including `.htaccess`, `index.php`, `php/`, `public/` and `data/`. PHP 8.2+ runs the server API, so no Node.js process or build step is needed on the host. Copy `.env.example` to `.env`, set your domain and a strong admin password, and follow [HOSTINGER.md](HOSTINGER.md) for the storefront and optional admin subdomain.

The PHP backend uses the **unchanged original frontend** and implements checkout, live stock, admin, accounts/rewards, gift cards, coupons, reviews, alerts, reporting, CSV exports and notifications. Orders and accounts persist as private JSON files. The original Node server remains available below.

## Run it locally with Node

```bash
npm start            # http://localhost:3000  (Node 20+, no dependencies)
PORT=8080 npm start  # another port
```

Admin dashboard: `/admin`. The password is `aarzu-admin` locally; set `ADMIN_PASSWORD` in `.env` before going live.

**Going live:** follow [DEPLOY.md](DEPLOY.md). It covers the domain, server, free HTTPS, order alerts, backups and the daily order routine. Settings and secrets go in `.env` (copy `.env.example`).

## Adding products

**Designer Edit (brand suits).** Save the Cowork JSON output to a file and run:

```bash
npm run import -- cowork-output.json
```

Code fences and `PART 1/4` labels are fine. Each piece gets an Aarzu name, a price of the brand price − Rs 1,000 (the brand price shows struck through), and a description that mentions the brand in its middle sentence. Brand photos are cached on first view in `data/runtime/img-cache/`. A running server reloads automatically.

**Aarzu Originals and accessories.** Designs live in `scripts/designs.mjs` (run `npm run generate` after editing). A piece goes live as soon as its photo exists:

```
public/images/originals/photos/<slug>.jpg      # main photo
public/images/originals/photos/<slug>-2.jpg    # extra angles (optional)
```

Slugs: `sindh-ajrak-noor`, `phulkari-bahar`, `rangeela-truck-art`, `multan-kashi`, `chandni-chikan`, `thar-sheesha`, `balochi-doch`, `swat-valley`, `kalash-rang`, `lahore-jharoka`, `gulabi-chunri`, `keri-bagh`, `kohistan-charcoal`, `ajrak-placket`, `peshawar-waistcoat`, `mirpur-pinstripe`, `balochi-collar`, `jummah-chikan`, `margalla-olive`, `mughal-night`, and the accessories listed in `scripts/designs.mjs`.

**Homepage banner photos (optional).** Put the second Cowork result in `data/media.json` (array of `{slot, image, ...}`; slots `hero` and `western` are used).

## Features

Feature modules live in `public/js/features/` (with matching `public/css/features/` and optional `lib/routes/` server modules) and are switched on in `public/js/features/index.js`:

- **quickview**: quick view from any product card, share buttons on product pages, "Order this bag on WhatsApp".
- **stitching**: darzi service on unstitched suits (standard / designer, size or custom measurements, style choices), a `/stitching` page and a "Stitching jobs" admin tab with printable job cards. Prices come from `addons.stitching` in `data/store.json`.
- **giftcards**: `/gift-cards` with Rs 2,000–25,000 digital cards (`data/catalog.giftcards.json`). Codes are created with the order, activate when you mark the order confirmed, and can be redeemed at checkout. There is a "Gift cards" admin tab.
- **account**: sign up / sign in by phone, `/account` dashboard (orders, addresses, profile), Aarzu Rewards points (200 welcome points, 1 point per Rs 100 earned on delivery, redeem 500+ at checkout), and a "Customers" admin tab.
- **policies**: `/privacy`, `/terms` and `/returns-policy`.
- **analytics**: Meta Pixel and Google Analytics 4. Off until you add IDs under `analytics` in `data/store.json`.
- **guides**: "Find my size" on ready-to-wear product pages (height, weight and fit, remembered on the shopper's device), a `/fabric-guide` page, and wash & care tips on every product.
- **alerts**:
  - **Back in stock:** "Notify me when it's back" on sold-out sizes. Shoppers with an email are emailed automatically when you restock. The "Restock requests" admin tab has WhatsApp links for everyone else.
  - **Abandoned bags:** checkouts that were started but not finished show in an admin tab with a polite WhatsApp follow-up link.
  - **Eid:** an `/eid` page with a countdown and an order-by date. A homepage banner appears 45 days before. Set the date under `festive` in `data/store.json`.
- **adminpro**:
  - **Insights** tab: revenue chart, top products, cities with refusal rates, cash on delivery vs prepaid, and new vs returning customers.
  - **Coupons** tab: create codes with an expiry date, a use limit and a minimum order.
  - **Exports** tab: orders as Excel/CSV, plus a courier bulk-booking sheet.
  - **Invoices:** printable invoices and packing slips from each order.
- **pwa**:
  - Customers can install Aarzu on their phone like an app.
  - Pages they've visited still open offline.
  - Google gets product price and stock details for search results.

## Taking orders safely

- **Order alerts:** an email and/or Telegram alert for every new order, plus branded emails to customers (received, dispatched with tracking, delivered, cancelled). Set it up in `.env` and check it with `npm run test-alerts`.
- **Cash-on-delivery protection:** set under `cod` in `store.json`.
  - Stitched-to-measure orders and orders above `maxTotal` need advance payment.
  - The admin flags phone numbers that refused deliveries before.
  - Order floods and bots are blocked.
- **Couriers:** couriers are listed in `couriers` in `store.json`. Add a courier and tracking number per order in admin; customers see them on the Track page. The "returned" status puts the stock back.
- **Link previews:** product links shared on WhatsApp or Facebook show the photo, name and price. There is also `/sitemap.xml` and `/robots.txt` for Google.
- **Backups:** data in `data/runtime/` is copied to `data/backups/<date>/` every 6 hours, keeping 30 days. Run one by hand with `npm run backup`.

## Brand assets

The logo family is in `public/brand/`:

- **Vector logos:** `aarzu-logo.svg` (plus `-dark`, `-tagline`, `-stacked`, `-stacked-dark`). All lettering is converted to outlines, so the files work anywhere.
- **Emblem:** `aarzu-mark.svg` and the app icon `aarzu-icon.svg`.
- **PNG exports:** for social media and print.

## Store settings

`data/store.json` holds delivery fee and free-delivery threshold, dispatch cut-off, multi-buy and bundle discounts, coupon codes, spin-wheel odds, launch-offer end date, contact details (replace the placeholder WhatsApp/phone/email) and delivery cities.

## How the selling features work

Everything shown to shoppers is backed by real data:

- **Struck-through prices** are the brands' actual retail prices.
- **"Only N left"** reflects stock you set in the admin.
- **"N others viewing"** counts real open browser sessions.
- **"Someone in Lahore ordered…"** popups come from real orders.
- **Reviews** are posted by customers.
- **The countdown** ends at the configured launch-offer date.
- **The spin wheel** shows its real odds.

Discounts are calculated identically in the browser and on the server (`public/js/pricing.js`).

Runtime data (orders, reviews, waitlist, stock changes) is saved in `data/runtime/` (git-ignored).
