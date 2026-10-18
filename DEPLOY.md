# Putting Aarzu online

This guide gets the shop running at your own address (for example `https://aarzu.pk`) with a free HTTPS padlock, automatic restarts, order alerts and daily backups. Allow about an hour the first time.

## What you need

| Item | Where | Approx. cost |
|---|---|---|
| A domain | `.pk`: any PKNIC-registered seller · `.com`: Namecheap, GoDaddy | Rs 2,500–4,000 / year |
| A small server (VPS, Ubuntu 24.04, 2 GB RAM) | Hetzner (CX22), DigitalOcean, Contabo | ~US$5–7 / month |
| A Gmail account for order emails | gmail.com | free |

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
