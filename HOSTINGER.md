# Aarzu on Hostinger Single / Premium

This deployment uses PHP 8.2 or newer for the server. All existing HTML, CSS, JavaScript, fonts, logos and page layouts in `public/` remain unchanged. The original Node server is still available for localhost or Node hosting.

## Upload the site

1. In hPanel, choose the **Aarzu website**, then select PHP **8.3** (8.2+ is supported). Keep the cURL, OpenSSL and mbstring extensions enabled.
2. Download this repository's latest ZIP. Back up the destination site's files first. Upload/extract the ZIP into that site's `public_html` folder, then move the **contents** of its enclosing `aarzu-…` folder into `public_html`. Include hidden `.htaccess` files. Leave your other websites' folders alone.
3. The resulting structure must include:
   - `public_html/index.php`
   - `public_html/.htaccess`
   - `public_html/php/`
   - `public_html/public/`
   - `public_html/data/`
4. Copy `.env.example` to `.env` in that same directory. Set `SITE_URL=https://aarzu.store`, `ADMIN_HOST=admin.aarzu.store` and `ADMIN_PASSWORD` to a unique password of at least 10 characters. Never commit `.env` to GitHub. The admin API stays locked until a password is configured; the storefront can still load.
5. Open the storefront, a product, `/shop`, and `/admin`. Log in with the password from `.env`. A page refresh on `/shop` must still work. If an old welcome page appears, check `.htaccess` was uploaded and clear Hostinger's cache.

There is no build, Composer install, database setup or `npm start` step on Hostinger. Upload the whole repository, rather than just `public/index.html`.

## Existing admin subdomain

For `admin.aarzu.store`, choose one of these document roots in hPanel. Upload the current PHP files and both `.htaccess` files before testing. Updating GitHub alone does not change files already uploaded to Hostinger.

Two layouts are supported; use the one that matches hPanel's document-root setting:

- **Same directory:** point the admin subdomain at the storefront's `public_html` directory and set `ADMIN_HOST=admin.your-domain` in the shared `.env`. Its homepage redirects to `/admin`.
- **Separate admin folder:** point the admin subdomain at this installation's `public_html/admin` directory. The included `admin/index.php` loads the parent application and its `.env`; it reads and writes the **same** orders, customers and stock. No second code or data copy is required.

Enable HTTPS for both hostnames in hPanel. The existing `/admin` address on the storefront also continues to work. Do not point the subdomain at a separate copy of the app with a different runtime directory.

## Keep orders and customer data

By default PHP uses `data/runtime/`, protected from HTTP access by the front controller. Prefer setting `RUNTIME_DIR` in `.env` to an absolute writable folder **outside** `public_html`, for example `/home/YOUR_HOSTINGER_USER/aarzu-data/runtime`. That folder is shared by both entry points and is not replaced when you upload site updates.

If you already have orders/accounts on localhost, upload those private files from the existing `data/runtime/` folder into the configured runtime directory. They are intentionally absent from GitHub. Existing Node password hashes can be verified when PHP's Sodium extension is available; otherwise use the admin Customers tab to reset an existing customer's password. New PHP accounts work without Sodium. If switching back to Node later, PHP-created/password-reset accounts need a password reset there because PHP uses its native password hashing format.

Do not overwrite or delete the live runtime folder during updates. File locking and a recoverable transaction journal keep order, inventory, gift-card and points updates together. Automatic backups run on requests at most every six hours, keeping 30 daily copies beside the runtime folder. For a scheduled backup independent of traffic, hPanel cron can run `php /absolute/path/to/public_html/scripts/backup.php` every six hours. Keep a separate off-server copy too.

## Store settings and notifications

Edit `data/store.json` to set real contact, payment and courier information. Its current WhatsApp number is a placeholder. Upload product photos into `public/images/originals/photos/` as documented in README.md. PHP reads settings and photos on each request; no rebuild or restart is needed.

Email and Telegram use the same `.env` variables as the Node server (`SMTP_*`, `MAIL_FROM`, `ORDER_ALERT_EMAIL`, `TELEGRAM_*`). SMTP ports 465 and 587 are supported. Notifications remain off until credentials are configured. Use `php scripts/test-alerts.php` from SSH to test delivery after configuration. Checkout still works if a notification provider is slow or unavailable; failures are written to the PHP error log.

## Verification

Before announcing the site, place a test order, check it appears in both admin addresses, confirm it, add courier tracking, and verify the customer's Track page. Test sign-up, gift-card activation/redemption, reward points, a coupon, stock editing, and the contact form. Email/Telegram delivery and the real domain/subdomain require verification on your hosting account.

For local development, `php -S 127.0.0.1:8080 index.php` runs the PHP site. With Node and PHP installed, `npm run test:php` starts an isolated temporary store and checks API compatibility without touching live orders or sending notifications.

The frontend regression checks run with `node tests/storefront-regressions.mjs`. They cover checkout confirmation, unavailable browser storage, wheel retry/validation, catalog exclusions and the Rs 1,000 price reduction; they do not replace live Hostinger testing.
