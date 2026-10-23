# Aarzu creator partnerships

Public signup and private creator dashboard: `https://aarzu.store/partnerships`.
The existing admin has a **Partnerships** tab. There are no new admin credentials.

## Programme

- Creator commission: 40% of eligible net product sales after discounts and store credits.
- Viewer coupon: 10% off eligible products. Gift cards are excluded.
- Delivery, gift-card purchases and stitching/add-ons do not earn commission. Order-wide deductions are allocated proportionally to eligible product prices. Amounts are rounded to the nearest rupee.
- Example: PKR 5,000 product less the 10% viewer discount = PKR 4,500 net product sales and PKR 1,800 commission, before any other offers/credits. Delivery is separate.
- Minimum available payout: PKR 5,000.
- Release requires delivered status, confirmation that payment was received, and a 14-day hold after delivery.
- Latest active creator link is remembered for 30 days in the same browser. An active creator code applied at checkout takes precedence. Returning visits do not extend the original attribution window.
- Cancelled/returned orders earn nothing. Partial product refunds reduce commission. Returns after a payout create an offset against future earnings.
- No self-referrals, fabricated orders or joining fee. Creator applications require manual channel review and activation.

The terms shown to creators and programme defaults are versioned. Existing orders retain their original rate, eligible sale amount and hold period. Payouts retain the amount, beneficiary details and terms version submitted when requested.

## Admin workflow

1. Open **Partnerships**. Review the applicant's public YouTube channel and contact identity before approving the application. Pause/reject with a reason when necessary.
2. Fulfil orders through the normal Orders tab. The Partnerships tab shows attributed orders without sending customer contacts to creators.
3. After delivery, use **Confirm payment collected** to record the COD settlement or incoming payment reference. Record any eligible product refund amount there too. This is an accounting confirmation, not a payment request to a bank.
4. Available commission appears automatically once the hold has passed. Creators can request their available balance when it reaches the minimum. One open request per creator reserves that amount.
5. For a payout request, check the amount and beneficiary, then make the transfer through your banking service. **Record completed transfer** only after it succeeds, with the actual bank transaction reference. The website does not initiate bank transfers.
6. If returns/refunds reduce the balance, recording a stale payout is blocked. Reject the request with the reason so the creator can request their corrected balance. Paid/rejected requests cannot be processed again.

The store commits to paying valid requests within two working days (Monday–Friday; bank holidays may affect bank processing). The creator dashboard shows Request payout and the expected date; the admin shows due and overdue requests. The store operator must perform and record the bank transfer within this period. No historical sales, payout claims, customer contact details, private admin figures or admin phone numbers are included in outreach.

## Storage and deployment

This feature supports both the PHP Hostinger entry point and the Node development server. Runtime data is in `RUNTIME_DIR/partner-book.json` and the existing accounts, sessions and orders files. Never commit runtime data. Protect backups because they contain payout bank details.

On PHP, the existing exclusive runtime lock and recovery journal cover order attribution, payout reservations and payout decisions. Node uses the storefront's single-process JSON store. Do not run multiple Node workers or PHP and Node against the same writable runtime directory.

All creator endpoints require the existing account session, except public programme information and referral-code resolution. Admin endpoints require the existing admin credential. Full bank details are returned only in the protected admin endpoint; creator payout history masks the account number. Customers' contact data is not returned in creator statements. Referral activity stores hashed browser IDs with bounded retention.

The optional PHP module is guarded during deployment so the main storefront can continue serving if its new file has not arrived yet. Corrupt partnership records block partnership operations rather than being silently replaced. Orders without a creator referral do not require partnership storage.

## Validation

Run `node tests/partnerships.test.mjs` for the actual Node HTTP contract. Run with `PARTNER_TEST_ENGINE=php` and the existing `PHP_WASM_MODULES` setting for the PHP contract. It covers consent, activation, ownership, link/code discounts, original cookie expiry, self-referrals, commission snapshots, holds, payment collection, refunds, payout reservations, stale balances, duplicate decisions, masked bank data and persistence.

The existing PHP compatibility, checkout/wheel/catalogue regression and SEO checks also cover this release. All test bank accounts and transfers are isolated fixtures. No live bank transfer is made by tests.

## Workspace and marketing tools

Admin and creator pages use a separate workspace layout, including before sign-in. The shopping navigation, offer wheel, floating store promotions and app-install banner are hidden there. The creator programme also opens at `/promotions` (excluded from indexing to avoid a duplicate search listing).

The admin **Marketing** tab builds links to actual in-stock products or the collection, with bounded source, medium, campaign and optional creative labels. It provides editable copy, a WhatsApp share link and downloadable campaign reports. These controls do not publish messages or start paid advertising.

Campaign links use standard `utm_*` parameters. The most recent valid tagged link is remembered in the shopper's browser for 30 days; direct visits do not renew it. On checkout, only the allowed campaign labels are saved with an order, without changing pricing or financial creator attribution. Missing, malformed or blocked browser storage does not prevent checkout. Do not put personal information in labels.

The protected `/api/admin/marketing?days=7|30|90` report groups new orders by campaign. Cancelled/returned orders are excluded from active and delivered value. Values include delivery/add-ons and must not be described as collected cash, profit or eligible creator sales. Historical orders without labels are reported separately, with no invented attribution. Public order tracking omits campaign metadata. Node and PHP follow the same validation, period and grouping rules.

Creator resources include tagged referral links and an editable caption with affiliate disclosure. The public earnings calculator is illustrative, accounts for the viewer discount, and makes no earnings guarantee. The admin creator review list supports search and status filters.

Run `node tests/marketing.test.mjs` for label/link validation, storage expiry, reporting and initial workspace selection. The Node/PHP partnership contract also exercises actual attributed checkout, ignored invalid labels, private reporting and reversals.
