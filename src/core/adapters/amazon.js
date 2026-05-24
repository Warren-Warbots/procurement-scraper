// Amazon adapter. No structured cart endpoint, so this reads the DOM. Selectors
// are inherently brittle and Amazon A/B-tests its markup, so each query lists a
// few fallbacks and every selector lives here (and is covered by fixture tests)
// so breakage is localized and visible.

import { num } from '../util.js';

export const key = 'amazon';

const ASIN_IN_URL = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i;

export function scrapeCart(ctx) {
  const doc = ctx.document;
  // Restrict to the "Active Items" block so saved-for-later rows are excluded.
  const active = doc.querySelector('#sc-active-cart, [data-name="Active Items"]') || doc;
  let lines = [...active.querySelectorAll('.sc-list-item[data-asin], [data-asin][data-itemtotal]')];
  if (!lines.length) lines = [...active.querySelectorAll('[data-asin]')];

  const seen = new Set();
  const out = [];
  for (const el of lines) {
    const asin = el.getAttribute('data-asin');
    if (!asin || seen.has(asin)) continue;
    seen.add(asin);
    out.push({
      partNumber: asin,
      description: text(el, ['.sc-product-title', '.a-truncate-full', '.sc-product-link', 'a .a-link-normal']),
      quantity: quantity(el),
      unitCost: num(text(el, ['.sc-product-price', '.sc-badge-price-to-pay .a-offscreen', '.a-price .a-offscreen', '.sc-price'])),
      weblink: dpUrl(ctx, asin),
    });
  }
  return out;
}

export function scrapeProduct(ctx) {
  const doc = ctx.document;
  const asin = asinFromUrl(ctx) || attr(doc, ['#ASIN', 'input#ASIN', '[data-asin]'], 'value', 'data-asin');
  return [
    {
      partNumber: asin || '',
      description: text(doc, ['#productTitle', '#title']),
      quantity: 1,
      unitCost: num(
        text(doc, [
          '#corePriceDisplay_desktop_feature_div .a-offscreen',
          '#corePrice_feature_div .a-offscreen',
          '.a-price .a-offscreen',
          '#priceblock_ourprice',
          '#price',
        ])
      ),
      weblink: asin ? dpUrl(ctx, asin) : ctx.location.href,
    },
  ];
}

// --- helpers ---

function quantity(el) {
  const input = el.querySelector('input.sc-quantity-textfield, input[name="quantity"]');
  if (input && input.value) return num(input.value, 1);
  const dq = el.getAttribute('data-quantity');
  if (dq) return num(dq, 1);
  const opt = el.querySelector('select option[selected], .a-dropdown-prompt');
  if (opt) return num(opt.textContent, 1);
  return 1;
}

function asinFromUrl(ctx) {
  const m = ASIN_IN_URL.exec(ctx.location.pathname || ctx.location.href || '');
  return m ? m[1] : null;
}

function dpUrl(ctx, asin) {
  return `${ctx.location.origin}/dp/${asin}`;
}

function text(root, selectors) {
  for (const sel of selectors) {
    const node = root.querySelector(sel);
    const t = node && node.textContent ? node.textContent.trim() : '';
    if (t) return t;
  }
  return '';
}

function attr(root, selectors, ...attrs) {
  for (const sel of selectors) {
    const node = root.querySelector(sel);
    if (!node) continue;
    for (const a of attrs) {
      const v = a === 'value' ? node.value : node.getAttribute(a);
      if (v) return v;
    }
  }
  return '';
}
