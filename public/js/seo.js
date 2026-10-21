// Shared by the Node server and client router. PHP reads the same page configuration.
export const seoPath = path => path === "/index.html" ? "/" : path.replace(/\/+$/, "") || "/";
export const privatePath = path => /^\/(?:admin|checkout|order|account|track|wishlist)(?:\/|$)/.test(path);
export const knownPath = (path, config, product) => !!product || !!config.pages?.[path] || /^\/(?:admin|checkout|account|track|wishlist)$/.test(path) || /^\/order\/[A-Z0-9]+$/.test(path) || /^\/admin\/invoice\/[A-Za-z0-9]{1,20}$/.test(path);
const absoluteImage = (origin, url) => /^https?:/.test(url || "") ? `${origin}/img?u=${encodeURIComponent(url)}` : new URL(url || "/brand/aarzu-logo-stacked.png", origin).href;
const suitLabel = p => p.category === "unstitched" ? `${p.pieces || 3}-Piece Unstitched ${p.fabric || ""} Suit`.replace(/\s+/g, " ") : p.category === "giftcard" ? "Digital Gift Card" : p.category === "accessory" ? (p.accessoryType || "Accessory") : "Shalwar Kameez";

export function pageSeo(url, config, products = [], store = {}, { admin = false } = {}) {
  const path = seoPath(url.pathname), origin = config.siteUrl.replace(/\/$/, "");
  const match = path.match(/^\/product\/([\w-]+)$/), product = match && products.find(p => p.slug === match[1]);
  const known = knownPath(path, config, product);
  let title = config.pages?.[path]?.title || (privatePath(path) ? `Aarzu ${path.split("/")[1]} | Aarzu` : "Page Not Found | Aarzu");
  let description = config.pages?.[path]?.description || "Manage your Aarzu orders and account.";
  let noindex = admin || !known || privatePath(path) || !!config.pages?.[path]?.noindex;
  if (product) {
    title = product.category === "giftcard" ? `${product.title} | Aarzu` : `${product.title} | ${suitLabel(product)} | Aarzu`;
    description = product.category === "giftcard" ? `Choose ${product.title} at Aarzu and add a personal message for your recipient. Digital gift cards activate after payment confirmation.` : `Shop ${product.title}, ${suitLabel(product).toLowerCase()}, for Rs ${Number(product.price).toLocaleString("en-PK")} at Aarzu. Cash on delivery across Pakistan. Check availability and delivery details.`;
    noindex ||= !!product.unlisted;
  }
  if (path === "/shop") {
    const q = url.searchParams;
    const matches = products.filter(p => !p.unlisted && ["gender", "category", "collection", "occasion"].every(k => !q.get(k) || (k === "occasion" ? p.occasions?.includes(q.get(k)) : p[k] === q.get(k))));
    noindex ||= q.has("q") || !matches.length;
  }
  return { path, origin, title, description, canonical: origin + path, image: absoluteImage(origin, product?.images?.[0]), imageAlt: product?.title || "Aarzu — Wear Your Wish", noindex, status: known ? 200 : 404, product };
}

export function seoGraph(meta, config, store = {}) {
  const { origin, path, product: p } = meta;
  const organization = { "@type": "OnlineStore", "@id": `${origin}/#organization`, name: config.siteName, alternateName: config.alternateNames, url: `${origin}/`, logo: `${origin}/brand/aarzu-logo.png`, areaServed: { "@type": "Country", name: "Pakistan" } };
  const sameAs = Object.values(store.social || {}).filter(u => { try { const x = new URL(u); return x.protocol === "https:" && x.pathname.replace(/\//g, "").length > 0; } catch { return false; } });
  if (sameAs.length) organization.sameAs = sameAs;
  const graph = [organization, { "@type": "WebSite", "@id": `${origin}/#website`, name: config.siteName, alternateName: config.alternateNames, url: `${origin}/`, publisher: { "@id": organization["@id"] }, inLanguage: "en-PK" }];
  if (meta.status === 404 || privatePath(path)) return graph;
  graph.push({ "@type": path === "/shop" ? "CollectionPage" : "WebPage", "@id": `${meta.canonical}#webpage`, url: meta.canonical, name: meta.title, description: meta.description, isPartOf: { "@id": `${origin}/#website` }, inLanguage: "en-PK" });
  const crumbs = [["Home", "/"]];
  if (p) {
    crumbs.push(p.category === "giftcard" ? ["Gift cards", "/gift-cards"] : ["Shop", "/shop"], [p.title, path]);
    const offer = { "@type": "Offer", url: meta.canonical, priceCurrency: "PKR", price: p.price, availability: `https://schema.org/${Object.values(p.stock || {}).some(n => n > 0) ? "InStock" : "OutOfStock"}`, itemCondition: "https://schema.org/NewCondition", seller: { "@id": organization["@id"] } };
    if (p.category !== "giftcard") offer.shippingDetails = { "@type": "OfferShippingDetails", shippingDestination: { "@type": "DefinedRegion", addressCountry: "PK" }, shippingRate: { "@type": "MonetaryAmount", value: p.price >= store.freeShippingThreshold ? 0 : store.shippingFee, currency: "PKR" } };
    const item = { "@type": "Product", "@id": `${meta.canonical}#product`, name: p.title, description: p.description || meta.description, url: meta.canonical, sku: p.id, image: (p.images || []).map(u => absoluteImage(origin, u)), ...(p.fabric ? { material: p.fabric } : {}), offers: offer };
    if (p.collection === "originals") item.brand = { "@type": "Brand", name: config.siteName };
    if (p.rating?.count > 0 && p.rating.avg >= 1 && p.rating.avg <= 5) item.aggregateRating = { "@type": "AggregateRating", ratingValue: p.rating.avg, reviewCount: p.rating.count, bestRating: 5, worstRating: 1 };
    graph.push(item);
  } else if (path !== "/") crumbs.push([meta.title.split(" | ")[0], path]);
  if (crumbs.length > 1) graph.push({ "@type": "BreadcrumbList", itemListElement: crumbs.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: origin + url })) });
  return graph;
}

export const robotsText = (origin, admin = false) => admin ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nAllow: /api/catalog$\nDisallow: /api/\nDisallow: /data/\nDisallow: /php/\nDisallow: /lib/\nDisallow: /scripts/\nDisallow: /node_modules/\nSitemap: ${origin}/sitemap.xml\n`;
export const sitemapUrls = (config, products) => [...Object.entries(config.pages).filter(([, p]) => !p.noindex).map(([path]) => config.siteUrl + path), ...products.filter(p => !p.unlisted).map(p => `${config.siteUrl}/product/${p.slug}`)];

export function updateSeo(doc, url, products, store) {
  const el = doc.getElementById("aarzu-seo-config");
  if (!el) return; // Static development entry points may not have server metadata.
  const config = JSON.parse(el.textContent), admin = /^admin\./i.test(url.hostname);
  const meta = pageSeo(url, config, products, store, { admin });
  doc.title = meta.title;
  const set = (selector, attr, value) => {
    let node = doc.head.querySelector(selector);
    if (!node) { node = doc.createElement(selector.startsWith("link") ? "link" : "meta"); const [, key, name] = selector.match(/\[(\w+)="([^"]+)"\]/); node.setAttribute(key, name); doc.head.append(node); }
    node.setAttribute(attr, value);
  };
  set('link[rel="canonical"]', "href", meta.canonical);
  set('meta[name="description"]', "content", meta.description);
  set('meta[name="robots"]', "content", meta.noindex ? "noindex,follow" : "index,follow,max-image-preview:large");
  for (const [key, value] of Object.entries({ title: meta.title, description: meta.description, url: meta.canonical, image: meta.image, "image:alt": meta.imageAlt, type: meta.product ? "product" : "website", site_name: config.siteName })) set(`meta[property="og:${key}"]`, "content", value);
  for (const [key, value] of Object.entries({ card: "summary_large_image", title: meta.title, description: meta.description, image: meta.image, "image:alt": meta.imageAlt })) set(`meta[name="twitter:${key}"]`, "content", value);
  for (const key of ["amount", "currency"]) {
    const selector = `meta[property="product:price:${key}"]`;
    if (meta.product) set(selector, "content", key === "currency" ? "PKR" : String(meta.product.price));
    else doc.head.querySelector(selector)?.remove();
  }
  const graph = doc.getElementById("aarzu-structured-data");
  if (graph) graph.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": seoGraph(meta, config, store) });
}
