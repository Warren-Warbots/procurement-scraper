// Shopify adapter. Works for any Shopify storefront (WCP, AndyMark, ThriftyBot,
// ...) with no DOM scraping: the cart is read from /cart.js and a product from
// /products/<handle>.json. Both are same-origin, so they work under strict CSP
// and carry the user's session cookies.

export const key = 'shopify';

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
