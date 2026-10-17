// Caches product photos from the brand CDNs on disk the first time they are
// requested, so pages load fast and keep working if a CDN blocks hotlinking.
// Only hosts on the allow-list can be fetched (no open proxy).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ALLOWED = [
  "cdn.shopify.com", "khaadi.com", "sanasafinaz.com", "limelight.pk", "sapphireonline.pk", "mariab.pk",
  "gulahmedshop.com", "alkaramstudio.com", "junaidjamshed.com", "edenrobe.com", "bonanzasatrangi.com",
  "nishatlinen.com", "images.unsplash.com", "images.pexels.com", "beechtree.pk", "zellbury.com", "amiradnan.com", "demandware.net", "cloudfront.net",
];

const TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif" };

export function allowedHost(u) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return ALLOWED.some((d) => h === d || h.endsWith("." + d));
  } catch {
    return false;
  }
}

export async function serveImage(url, cacheDir, res) {
  if (!url || !allowedHost(url)) {
    res.writeHead(400).end("blocked");
    return;
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const key = crypto.createHash("sha1").update(url).digest("hex");
  const hit = fs.readdirSync(cacheDir).find((f) => f.startsWith(key));
  if (hit) {
    res.writeHead(200, { "Content-Type": TYPES[path.extname(hit)] || "image/jpeg", "Cache-Control": "public, max-age=2592000" });
    fs.createReadStream(path.join(cacheDir, hit)).pipe(res);
    return;
  }
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36", Accept: "image/avif,image/webp,image/*,*/*" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const type = (r.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!type.startsWith("image/")) throw new Error(`not an image: ${type}`);
    const ext = Object.entries(TYPES).find(([, t]) => t === type)?.[0] || ".jpg";
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(path.join(cacheDir, key + ext), buf);
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=2592000" });
    res.end(buf);
  } catch (e) {
    // Fall back to letting the browser load it directly from the brand CDN.
    res.writeHead(302, { Location: url, "Cache-Control": "no-store" });
    res.end();
  }
}
