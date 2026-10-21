import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pageSeo, seoGraph, robotsText, sitemapUrls } from "../public/js/seo.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "public/seo-config.json")));
const products = JSON.parse(fs.readFileSync(path.join(root, "data/catalog.brands.json")));
const store = JSON.parse(fs.readFileSync(path.join(root, "data/store.json")));
const product = products.find(p => Object.values(p.stock).some(n => n > 0));
const url = p => new URL(p, config.siteUrl);
const home = pageSeo(url("/"), config, products, store);
assert(home.title.startsWith("Aarzu |")); assert(!home.noindex);
const meta = pageSeo(url(`/product/${product.slug}?utm_source=test`), config, products, store);
assert.equal(meta.canonical, `${config.siteUrl}/product/${product.slug}`);
assert(meta.title.includes(product.title)); assert(meta.description.includes("Cash on delivery"));
const graph = seoGraph(meta, config, store), item = graph.find(x => x["@type"] === "Product");
assert.equal(item.offers.price, product.price);
assert.equal(item.offers.availability, "https://schema.org/InStock");
assert.equal(item.offers.shippingDetails.shippingRate.value, product.price >= store.freeShippingThreshold ? 0 : store.shippingFee);
assert(!item.brand); assert(!item.aggregateRating); // No invented brands or reviews.
assert(!graph[0].sameAs); assert(!graph[0].address); assert(!graph[0].telephone); // Placeholder contact/social data is excluded.
assert(graph.some(x => x["@type"] === "BreadcrumbList"));
for (const route of ["/admin", "/checkout", "/order/AZ123", "/account", "/track", "/wishlist", "/shop?q=khaddar", "/shop?gender=men", "/western"]) assert(pageSeo(url(route), config, products, store).noindex, route);
for (const route of ["/missing-page", "/product/not-real", `/product/${product.slug}/extra`]) assert.equal(pageSeo(url(route), config, products, store).status, 404, route);
assert(pageSeo(url("/"), config, products, store, { admin: true }).noindex);
const paths = sitemapUrls(config, products);
assert.equal(new Set(paths).size, paths.length);
assert(paths.every(u => !u.includes("?") && !/western|\/admin|\/checkout/.test(u)));
assert(robotsText(config.siteUrl).includes("Allow: /api/catalog$"));
assert(robotsText(config.siteUrl).includes("Disallow: /api/"));
assert.equal(robotsText(config.siteUrl, true), "User-agent: *\nDisallow: /\n");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aarzu-node-seo-"));
const probe = net.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const child = spawn(process.execPath, ["server.mjs"], { cwd: root, env: { ...process.env, PORT: String(port), RUNTIME_DIR: path.join(temp,"runtime"), BACKUP_DIR: path.join(temp,"backups"), ADMIN_PASSWORD: "FixtureAdminPass!", ADMIN_HOST: "admin.aarzu.test", SITE_URL: config.siteUrl }, stdio: ["ignore", "pipe", "pipe"] });
let error = ""; child.stderr.on("data", d => error += d); child.on("error", e => error += e.message);
const get = (p, host) => new Promise((resolve, reject) => {
  http.get({ hostname: "127.0.0.1", port, path: p, headers: host ? { Host: host } : {} }, res => {
    const chunks=[]; res.on("data", chunk=>chunks.push(chunk));
    res.on("end",()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
  }).on("error", reject);
});
try {
  for (let i=0; i<100; i++) { try { await get("/"); break; } catch { await new Promise(resolve => setTimeout(resolve, 30)); } }
  let r = await get("/"); assert.equal(r.status, 200); const html = await r.text();
  assert(html.includes("Aarzu | Women's Shalwar Kameez &amp; Unstitched Suits"));
  assert(html.includes('id="aarzu-seo-config"')); assert(html.includes('"@type":"OnlineStore"'));
  r = await get(`/product/${product.slug}`); assert.equal(r.status, 200);
  const productHtml = await r.text(); assert(productHtml.includes('"@type":"BreadcrumbList"'));
  for (const p of ["/not-a-real-page", "/product/not-a-real-product"]) assert.equal((await get(p)).status, 404);
  for (const p of ["/index.html", "/shop/"]) assert.equal((await get(p)).status, 301);
  assert.equal((await get("/checkout")).headers.get("x-robots-tag"), "noindex, follow");
  assert.equal((await get("/api/catalog")).headers.get("x-robots-tag"), "noindex");
  r = await get("/robots.txt"); assert.equal(r.headers.get("cache-control"), "no-cache"); assert((await r.text()).includes("Allow: /api/catalog$"));
  r = await get("/robots.txt", "admin.aarzu.test"); assert.equal(await r.text(), "User-agent: *\nDisallow: /\n");
  r = await get("/sitemap.xml"); assert.equal(r.headers.get("cache-control"), "no-cache"); const xml = await r.text();
  assert([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].every(m=>!m[1].includes("?"))); assert(xml.includes(`/product/${product.slug}`));
  assert.equal(error, "");
  console.log("PASS Node SEO HTTP responses, brand/product schema, canonical URLs, crawler resources, private pages, sitemap and real 404s");
} finally { child.kill(); await new Promise(resolve => child.once("exit", resolve)); fs.rmSync(temp, { recursive: true, force: true }); }
