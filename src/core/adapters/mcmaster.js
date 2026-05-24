// McMaster-Carr adapter. The cart ("Order") page is a SPA, but each line exposes
// stable input classes we can read directly (confirmed against the live page):
//   input.line-part-number-input  -> part number
//   input.line-quantity-input     -> quantity
//   div.line-total-price          -> line total ($)
// The per-unit price has no stable class, so unit cost is derived from the line
// total ÷ quantity — which also keeps "Packs of N" lines internally consistent
// (e.g. 4 packs @ $14.57 -> $58.28 total). Product pages fall back to part-number
// from the URL + a price scan.

import { num } from '../util.js';

export const key = 'mcmaster';

const PART_NO = /\b\d{3,6}[A-Z]\d{2,6}[A-Z0-9]*\b/;
const PART_PATH = /^\/(\d{3,6}[A-Z]\d{2,6}[A-Z0-9]*)\/?$/i;
const PRICE = /\$\s?([\d,]+\.\d{2})/;

export async function scrapeCart(ctx) {
  await settle(ctx);
  const doc = ctx.document;

  // Parallel per-line arrays, in document order.
  const parts = [...doc.querySelectorAll('input.line-part-number-input')].map((i) => (i.value || '').trim().toUpperCase());
  const qtys = [...doc.querySelectorAll('input.line-quantity-input')].map((i) => num(i.value, 1));
  const totals = [...doc.querySelectorAll('.line-total-price')].map((e) => priceFromText(e.textContent));
  const descs = descByPart(doc);

  const n = Math.min(parts.length, qtys.length, totals.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const partNumber = parts[i];
    if (!partNumber) continue; // skip the blank "add a line" row
    const quantity = qtys[i];
    out.push({
      partNumber,
      description: descs[partNumber] || '',
      quantity,
      unitCost: quantity > 0 ? totals[i] / quantity : 0,
      weblink: partUrl(ctx, partNumber),
    });
  }
  return out;
}

export async function scrapeProduct(ctx) {
  await settle(ctx);
  const doc = ctx.document;
  const partNumber = partFromUrl(ctx) || partFromTitle(doc);
  return [
    {
      partNumber: partNumber || '',
      description: cleanTitle(doc),
      quantity: 1,
      unitCost: priceFromText((doc.querySelector('[class*="Price" i], [class*="price" i]') || doc.body || {}).textContent),
      weblink: partNumber ? partUrl(ctx, partNumber) : ctx.location.href,
    },
  ];
}

// --- helpers ---

// Map part number -> description, by matching product links (/<PARTNO>/) to their text.
function descByPart(doc) {
  const map = {};
  for (const a of doc.querySelectorAll('a[href]')) {
    const m = PART_PATH.exec(a.getAttribute('href') || '');
    if (!m) continue;
    const pn = m[1].toUpperCase();
    const t = (a.textContent || '').trim();
    if (t && t.toUpperCase() !== pn && !map[pn]) map[pn] = t;
  }
  return map;
}

function priceFromText(text) {
  const m = PRICE.exec(text || '');
  return m ? num(m[1]) : 0;
}

function partFromUrl(ctx) {
  const m = PART_PATH.exec(ctx.location.pathname || '');
  return m ? m[1].toUpperCase() : null;
}

function partFromTitle(doc) {
  const m = PART_NO.exec(doc.title || '');
  return m ? m[0].toUpperCase() : null;
}

function cleanTitle(doc) {
  const h1 = doc.querySelector('h1');
  const raw = (h1 && h1.textContent.trim()) || doc.title || '';
  return raw.replace(/\s*\|\s*McMaster-?Carr\s*$/i, '').trim();
}

function partUrl(ctx, partNumber) {
  return `${ctx.location.origin}/${partNumber}/`;
}

// Wait briefly for SPA content; resolves immediately once a line/link is present.
function settle(ctx) {
  const w = ctx.window;
  if (!w || typeof w.requestAnimationFrame !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    let tries = 0;
    const tick = () => {
      const ready = ctx.document.querySelector('input.line-part-number-input, a[href]') || tries++ > 10;
      if (ready) resolve();
      else w.requestAnimationFrame(tick);
    };
    tick();
  });
}
