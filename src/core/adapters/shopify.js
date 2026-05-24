// Shopify adapter. Works for any Shopify storefront (WCP, AndyMark, ThriftyBot,
// ...) with no DOM scraping: the cart is read from /cart.js and a product from
// /products/<handle>.json. Both are same-origin, so they work under strict CSP
// and carry the user's session cookies.
//
// Special case: WCP "kit builder" product pages render a configurator (a custom
// app using Magento-ish markup: div.admin__field-option rows with a
// input.product-custom-option checkbox, a per-row input.option-qty, the SKU in
// the label as "(KIT-0094)", and a "+$224.99" price). When present, a product
// page returns every CHECKED component instead of the single base product.

import { num } from '../util.js';

export const key = 'shopify';

const CFG_PART = /\(([A-Z]{2,5}-\d{3,5})\)/;
const CFG_PRICE = /\$\s?([\d,]+\.\d{2})/;

export async function scrapeCart(ctx) {
  const cart = await ctx.fetch('/cart.js').then((r) => r.json());
  return (cart.items || []).map((it) => ({
    partNumber: it.sku || '',
    description: describe(it.product_title || it.title, it.variant_title),
    quantity: it.quantity,
    // final_price is the per-unit price in cents (after line discounts).
    unitCost: price(it.final_price ?? it.price),
    weblink: absolute(ctx, it.url),
  }));
}

export async function scrapeProduct(ctx) {
  // Kit-builder pages: return the checked components, not the base product.
  const configured = scrapeConfigurator(ctx);
  if (configured.length) return configured;

  const handle = productHandle(ctx.location.pathname);
  if (!handle) throw new Error('Not a Shopify product page.');
  const { product } = await ctx.fetch(`/products/${handle}.json`).then((r) => r.json());
  const variant = selectedVariant(product, ctx.location.search);
  return [
    {
      partNumber: variant.sku || '',
      description: describe(product.title, variant.title),
      quantity: 1,
      unitCost: price(variant.price),
      weblink: productUrl(ctx, handle, variant.id),
    },
  ];
}

// --- WCP kit-builder configurator ---

// Returns one item per CHECKED, visible component row. Empty array if this isn't
// a configurator page (so scrapeProduct falls back to the normal product fetch).
function scrapeConfigurator(ctx) {
  const out = [];
  const seen = new Set();
  for (const cb of ctx.document.querySelectorAll('input.product-custom-option')) {
    if (!cb.checked) continue;
    const row = cb.closest('.admin__field-option');
    if (!row || row.classList.contains('ihidden')) continue; // skip hidden alternates
    const text = (row.textContent || '').replace(/\s+/g, ' ').trim();
    const m = CFG_PART.exec(text);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const priceMatch = CFG_PRICE.exec(text.slice(m.index + m[0].length)) || CFG_PRICE.exec(text);
    const qtyEl = row.querySelector('input.option-qty, input[name^="options_qty"]');
    out.push({
      partNumber: m[1],
      description: text.slice(0, m.index).trim(), // name (incl. descriptive parens), minus the SKU/price
      quantity: qtyEl ? num(qtyEl.value, 1) : 1,
      unitCost: priceMatch ? num(priceMatch[1]) : 0,
      weblink: ctx.location.href,
    });
  }
  return out;
}

// --- helpers ---

// cart.js prices are integer cents; products/<handle>.json prices are dollar
// strings ("9.99"). Discriminate on type rather than guessing magnitude.
function price(p) {
  if (typeof p === 'number') return p / 100;
  const n = parseFloat(p);
  return Number.isFinite(n) ? n : 0;
}

function describe(title, variantTitle) {
  const v = (variantTitle || '').trim();
  if (v && v.toLowerCase() !== 'default title') return `${title} (${v})`;
  return title || '';
}

function productHandle(pathname) {
  const m = /\/products\/([^/?#]+)/.exec(pathname || '');
  return m ? m[1] : null;
}

function selectedVariant(product, search) {
  const variants = product.variants || [];
  const id = new URLSearchParams(search || '').get('variant');
  if (id) {
    const hit = variants.find((v) => String(v.id) === String(id));
    if (hit) return hit;
  }
  return variants[0] || {};
}

function productUrl(ctx, handle, variantId) {
  const base = `${ctx.location.origin}/products/${handle}`;
  return variantId ? `${base}?variant=${variantId}` : base;
}

function absolute(ctx, url) {
  try {
    return new URL(url, ctx.location.origin).toString();
  } catch {
    return url || '';
  }
}
