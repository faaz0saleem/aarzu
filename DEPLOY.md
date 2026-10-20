# Putting Aarzu online

This guide gets the shop running at your own address (for example `https://aarzu.pk`) with a free HTTPS padlock, automatic restarts, order alerts and daily backups. Allow about an hour the first time.

## What you need

| Item | Where | Approx. cost |
|---|---|---|
| A domain | `.pk`: any PKNIC-registered seller · `.com`: Namecheap, GoDaddy | Rs 2,500–4,000 / year |
| A small server (VPS, Ubuntu 24.04, 2 GB RAM) | Hetzner (CX22), DigitalOcean, Contabo | ~US$5–7 / month |
| A Gmail account for order emails | gmail.com | free |

## Where your data lives (no database to pay for)

Customers, accounts, orders, stock, reviews, gift cards and points are all saved as plain files in `data/runtime/` on whichever computer runs the shop. There is no paid database, and each copy in `data/backups/` is one dated folder of those files.

Shoppers' bags, wishlists and recently viewed items are kept in their own browser.

## Free or almost-free hosting

Any host works as long as **its disk keeps your files**. Avoid the free plans of Render, Railway, Vercel, Netlify and Heroku: they wipe the disk on every restart, so orders and accounts would be lost.

**Option A: Oracle Cloud "Always Free" (Rs 0 per month).**
1. Sign up at oracle.com/cloud/free. A card is needed to verify you, but Always Free resources are not charged.
2. Create an Ubuntu VM ("Ampere A1" shape is in the free limits).
3. In the VM's network security list, open ports 80 and 443.
4. Follow steps 1–4 below exactly as written.

Oracle can stop free machines it sees as idle. Upgrading the account to "Pay As You Go" stops that, and you still pay nothing while you stay inside the free limits.

**Option B: your own computer + Cloudflare Tunnel (Rs 0 per month).** The shop and all its data stay on your own computer, which must stay on and awake while you take orders.
1. Start the shop as usual with `npm start`.
2. In a second terminal install the tunnel. On a Mac run `brew install cloudflared`; on Windows download it from Cloudflare's website.
3. **Quick test link (free, no account):** run `cloudflared tunnel --url http://localhost:3000`. It prints an `https://….trycloudflare.com` address anyone can open. The address changes every time, so use it only for trying things out.
4. **Your own permanent address:** add your domain to a free Cloudflare account, then run:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create aarzu
   cloudflared tunnel route dns aarzu YOUR_DOMAIN
   cloudflared tunnel run --url http://localhost:3000 aarzu
   ```
5. In `.env` set `TRUST_PROXY=1` and `SITE_URL=https://YOUR_DOMAIN`, then restart the shop. Without `TRUST_PROXY=1`, all shoppers look like one visitor and the spam limits block real orders.
6. Copy `data/backups/` to a USB drive or Google Drive now and then. If the computer dies, the data goes with it.

**Option Hostinger Single / Premium (PHP).** Use the included PHP backend with the original frontend. Follow [HOSTINGER.md](HOSTINGER.md): upload the repository contents, including `.htaccess`, directly into `public_html/`, then set `.env`. An optional `admin/` entry point shares the same orders and stock for an admin subdomain. No Node process is needed, and no storefront features are disabled.

**Option Hostinger Business / Cloud / VPS (Node.js).** The original server can still be deployed as follows:
- **Business or Cloud web hosting (Node.js Web App):**
  1. In hPanel go to **Websites → Add website → Node.js app**.
  2. Connect GitHub (repo `aarzu`, branch `claude/modest-wright-6wemmy`) or upload the project zip.
  3. Settings: Node version **20 or newer**, entry file **`server.js`**, start command **`npm start`**. There is no build step.
  4. Add these **environment variables** in hPanel:
     - `NODE_ENV=production`
     - `ADMIN_PASSWORD` (long)
     - `SITE_URL=https://YOUR_DOMAIN`
     - `RUNTIME_DIR=/home/YOUR_HOSTINGER_USER/aarzu-data/runtime`, a folder **outside** the app folder, so redeploys never wipe orders and accounts. Backups go next to it, in `aarzu-data/backups`.
     - Email settings from `.env.example` if you want order alerts.
  5. Deploy. Hostinger handles the port and HTTPS.
  6. Put Originals photos in `public/images/originals/photos/` and commit them to GitHub, so every redeploy includes them.
  7. To change prices, coupons or contact details in `data/store.json`, edit it on GitHub and redeploy.
- **Hostinger VPS (KVM 1 or higher):** choose the Ubuntu template, then follow steps 1–4 below exactly as written.

**Option C: a paid VPS (~Rs 1,500–2,000 per month)**, as in the table above. It is the most reliable choice once orders pick up.

## 1. Point the domain at the server

Create the server first and note its **IP address**. In your domain's DNS settings add two **A records**:

| Name | Value |
|---|---|
| `@` | your server IP |
| `www` | your server IP |

DNS can take from a few minutes to a few hours to update.

## 2. Install the shop

Log in to the server (`ssh root@YOUR_SERVER_IP`) and run:

```bash
curl -fsSL https://get.docker.com | sh
git clone -b claude/modest-wright-6wemmy https://github.com/faaz0saleem/aarzu.git
cd aarzu
cp .env.example .env
nano .env
```

If the GitHub repository is private, create a token at github.com → Settings → Developer settings → Personal access tokens. Then clone with `git clone https://YOUR_TOKEN@github.com/faaz0saleem/aarzu.git`.

In `nano`, fill in at least `DOMAIN`, `SITE_URL` and a long `ADMIN_PASSWORD`. Add the email settings too (step 4). Save with Ctrl+O, Enter, then exit with Ctrl+X.

## 3. Start it

```bash
docker compose up -d --build
```

That's it. Open `https://YOUR_DOMAIN`. The padlock certificate is created automatically the first time; give it a minute.

- See what the server is doing: `docker compose logs -f app`
- Restart: `docker compose restart app`

## 4. Turn on order alerts

**Email (recommended).** Turn on 2-Step Verification on your Gmail. Create an *App password* at <https://myaccount.google.com/apppasswords> and put it in `SMTP_PASS` in `.env`. Then run:

```bash
docker compose up -d
docker compose exec app node scripts/test-alerts.mjs
```

You should receive a test email. From now on:

- You get an email for every new order, with a one-tap "confirm on WhatsApp" link.
- Customers who give an email get a receipt, then dispatch, delivery and cancellation updates.

**Telegram (instant phone pings, optional).** In Telegram, message **@BotFather**, send `/newbot` and copy the token into `TELEGRAM_BOT_TOKEN`. Send any message to your new bot, then message **@userinfobot** to get your chat id for `TELEGRAM_CHAT_ID`. Restart and test as above.

## 5. Before you announce the shop

- [ ] **`data/store.json`:** put your real WhatsApp number, phone, email, address and social links in `contact` and `social`.
- [ ] **`data/store.json` → `payments`:** put your real bank account, IBAN and JazzCash/Easypaisa numbers. Shoppers see these after ordering.
- [ ] **`data/store.json` → `couriers`:** keep the couriers you use and check each tracking link.
- [ ] **Stock:** in `/admin` → **Stock**, set the real quantity for every size. Set 0 for anything you can't supply.
- [ ] **Photos:** upload your product photos to `public/images/originals/photos/`, for example with `scp *.jpg root@YOUR_SERVER_IP:~/aarzu/public/images/originals/photos/`. They appear without a restart.
- [ ] **Test order:** place one from your phone, confirm you got the alert, then mark it dispatched with a tracking number in `/admin`.
- [ ] **Optional ad tracking:** add your Meta Pixel and Google Analytics IDs in `data/store.json` → `analytics`.

After editing `data/store.json`, run `docker compose restart app`.

## Daily routine (taking orders)

1. A new-order alert arrives. Open `/admin` → **Orders**.
2. Check the badge on the order:
   - **⚠ Refused before** means take an advance or call first.
   - **★ delivered before** means a trusted customer.
3. Tap **Confirm** to send the customer a ready-made WhatsApp message. When they reply YES, set the status to **confirmed**.
4. Book the parcel with your courier. Choose the courier, enter the tracking number and press **Save**. Set the status to **dispatched**, then tap **Dispatch msg** to WhatsApp them.
5. Mark **delivered** when it arrives. Use **returned** if the customer refuses it; that puts the stock back and flags the number for next time.

The shop protects you automatically:
- **Cash on delivery limits:** stitched-to-measure orders and orders over Rs 30,000 can't use cash on delivery. Change this in `cod` in `store.json`.
- **Spam limits:** too many orders from the same number are blocked.
- **Bot trap:** a hidden field stops bots from placing orders.

## Backups

- **Automatic:** orders, customers, stock and reviews are copied every 6 hours to `data/backups/<date>/`, and the last 30 days are kept.
- **Manual:** `docker compose exec app node lib/backup.mjs`
- **Off the server:** keep a copy on your own computer too, for example weekly: `scp -r root@YOUR_SERVER_IP:~/aarzu/data/backups ./aarzu-backups`

## Updating the shop

```bash
cd ~/aarzu
git pull
docker compose up -d --build
```

Your orders and settings live in `data/` and are kept across updates.

## Without Docker (any Linux server with Node 20+)

```bash
cp .env.example .env    # fill it in
NODE_ENV=production node server.mjs
```

Keep it running with a process manager (`pm2 start server.mjs`, or a systemd service). Put Caddy or nginx in front for HTTPS, and set `TRUST_PROXY=1` in `.env`.
