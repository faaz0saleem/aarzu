# Aarzu · آرزو

Shalwar kameez storefront for women and men: a Designer Edit of big-brand suits priced Rs 1,000 under retail, plus our own **Aarzu Originals** inspired by the crafts of Pakistan. Western wear is shown as *coming soon* with a waitlist.

## Run it

```bash
npm start            # http://localhost:3000  (Node 20+, no dependencies)
PORT=8080 npm start  # another port
```

Admin dashboard: `/admin` (password `aarzu-admin`, change it with `ADMIN_PASSWORD=...`).

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
