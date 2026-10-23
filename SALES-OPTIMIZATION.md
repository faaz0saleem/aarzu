# Sales measurement and content tools

## Measurement

The existing Google tag and GA4 ID `G-Q47XHHZ5ZD` are reused, without installing another loader or reconfiguring the head tag. The analytics feature reads the head's `aarzu-ga4-id` marker when the optional store analytics setting is empty.

Product views, actual cart additions, checkout and payment-method selection include catalog item IDs, quantities and PKR values. Only a validated successful order response emits `order-placed` and triggers purchase measurement. An arbitrary order URL does not generate a purchase. A transaction ID and a session/memory guard prevent duplicate events. Custom measurements, names, phone numbers, addresses and emails are not included. Analytics failures cannot interrupt confirmed checkout.

Google Ads conversion goals must use the intended purchase conversion action or an imported GA4 purchase event; installing a base Ads tag alone does not establish a purchase conversion label. No new conversion label is invented. Value is the amount due excluding shipping, with credits/discounts reflected in item allocation; it is not profit or a delivery/payment-settlement report.

## Live Merchant Center feed

`https://aarzu.store/products.xml` (alias `/google-products.xml`) returns the current women's clothing catalog with the existing product IDs. The Node and PHP implementations read current inventory on each fetch. The feed excludes unlisted items, gift cards and men's placeholders. It includes price, availability, images, material, size, shipping and landing-page links. No GTIN or brand identifier is invented.

Use scheduled fetching on the existing Merchant Center source with its existing language, country and feed label. Do not add a duplicate primary source or delete products while their initial review is pending. Updating the source does not itself approve products or guarantee ad delivery.

## Admin Content studio

The Content studio creates square, portrait and story product posts from an in-stock catalog product. The complete source photo is fitted into the layout, without face cropping or clothing alterations. Product title, fabric, current listed price and store link appear on the export. Download PNG and copy an editable caption with a tagged campaign link. A failed or blocked image load disables export rather than creating an incomplete asset. Font loading is bounded so it cannot keep the tool waiting indefinitely.

The brand profile kit provides a name, bio and existing Aarzu icon. These tools do not create social accounts, accept platform terms, upload ads, confirm image rights, or publish posts automatically. Use photographs you are authorised to use in advertising. Generic social-platform homepage links are hidden until real profile URLs are configured.

## Validation

`node tests/ecommerce.test.mjs` verifies safe event payloads, confirmed-order-only purchase tracking, deduplication, blocked storage and reuse of the Google tag. Checkout regression tests verify that only confirmed orders emit the purchase signal. Existing PHP/Node HTTP checks cover the public live feed, current IDs/prices, supported methods and checkout, inventory, account and admin regressions.
