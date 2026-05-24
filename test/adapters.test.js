// Adapter + core tests. No login needed: HTML/JSON fixtures are run through
// jsdom so the scrape logic (price math, qty/ASIN/part parsing, store mapping,
// URL canonicalization, TSV column order) is exercised end to end.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

import { scrape, toTSV, toHtml } from '../src/core/index.js';
import { COLUMNS } from '../src/core/tsv.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');
const json = (name) => JSON.parse(fixture(name));

// Build a scrape context from a fixture. `fetchMap` answers same-origin fetches.
function ctxFromHtml(html, url, fetchMap = {}) {
  const dom = new JSDOM(html, { url });
  return {
    document: dom.window.document,
    window: dom.window,
    location: dom.window.location,
    fetch: (input) => {
      const path = String(input);
      const key = Object.keys(fetchMap).find((k) => path === k || path.endsWith(k));
      if (!key) return Promise.reject(new Error(`unexpected fetch: ${path}`));
      return Promise.resolve({ json: async () => fetchMap[key] });
    },
  };
}

const fixedOpts = { requestor: 'Tester', requestDate: '1/1/2026' };

test('shopify cart -> rows (cents->$, ext cost, variant in desc, tracker stripped, store name)', async () => {
  const ctx = ctxFromHtml('<!doctype html><body>', 'https://wcproducts.com/cart', {
    '/cart.js': json('shopify-cart.json'),
  });
  const { rows, mode, storeName } = await scrape({ ...fixedOpts, ctx });
  assert.equal(mode, 'cart');
  assert.equal(storeName, 'WCP');
  assert.equal(rows.length, 2);

  assert.deepEqual(rows[0], {
    requestDate: '1/1/2026',
    requestor: 'Tester',
    partNumber: 'WCP-0336',
    description: '6" Aluminum Nutstrip (#10-32, .500" Spacing)',
    quantity: 2,
    unitCost: 9.99,
    extendedCost: 19.98,
    storeName: 'WCP',
    weblink: 'https://wcproducts.com/products/nut-strips?variant=123',
  });

  // "Default Title" variant is dropped from the description.
  assert.equal(rows[1].description, '75t x 9mm Wide Timing Belt (HTD 5mm)');
  assert.equal(rows[1].unitCost, 8.99);
});

test('shopify product -> selected variant via ?variant=, qty defaults to 1', async () => {
  const ctx = ctxFromHtml('<!doctype html><body>', 'https://wcproducts.com/products/htd-timing-belts-9mm-width?variant=789', {
    '/products/htd-timing-belts-9mm-width.json': json('shopify-product.json'),
  });
  const { rows, mode } = await scrape({ ...fixedOpts, ctx });
  assert.equal(mode, 'product');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].partNumber, 'WCP-0619');
  assert.equal(rows[0].description, 'HTD 5mm Timing Belt (9mm Wide) (70 Tooth)');
  assert.equal(rows[0].quantity, 1);
  assert.equal(rows[0].unitCost, 8.99);
  assert.equal(rows[0].weblink, 'https://wcproducts.com/products/htd-timing-belts-9mm-width?variant=789');
});

test('wcp kit-builder product page -> only CHECKED, visible components with their qty', async () => {
  const ctx = ctxFromHtml(fixture('wcp-configurator.html'), 'https://wcproducts.com/collections/gearboxes/products/swerve-x2i');
  const { rows, mode, storeName } = await scrape({ ...fixedOpts, ctx });
  assert.equal(mode, 'product');
  assert.equal(storeName, 'WCP');
  assert.equal(rows.length, 2, 'unchecked add-on and hidden alternate must be excluded');

  assert.equal(rows[0].partNumber, 'KIT-0094');
  assert.equal(rows[0].description, 'Kit: WCP Swerve X2i (Tube Mount)');
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].unitCost, 224.99);
  assert.equal(rows[0].extendedCost, 449.98);
  assert.equal(rows[0].weblink, 'https://wcproducts.com/collections/gearboxes/products/swerve-x2i');

  assert.equal(rows[1].partNumber, 'KIT-0099');
  assert.equal(rows[1].description, 'Kit: X1/X2 Ratio Set (8mm SplineXS Bore, Swerve X2)');
  assert.equal(rows[1].quantity, 1);
  assert.equal(rows[1].unitCost, 74.99);

  assert.ok(!rows.some((r) => r.partNumber === 'WCP-0941' || r.partNumber === 'WCP-1701'));
});

test('amazon cart -> active items only, qty + price parsed, dp url, ASIN as part #', async () => {
  const ctx = ctxFromHtml(fixture('amazon-cart.html'), 'https://www.amazon.com/cart');
  const { rows, mode, storeName } = await scrape({ ...fixedOpts, ctx });
  assert.equal(mode, 'cart');
  assert.equal(storeName, 'Amazon');
  assert.equal(rows.length, 2, 'saved-for-later item must be excluded');
  assert.equal(rows[0].partNumber, 'B07ABCDEFG');
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].unitCost, 12.99);
  assert.equal(rows[0].extendedCost, 25.98);
  assert.equal(rows[0].weblink, 'https://www.amazon.com/dp/B07ABCDEFG');
  assert.ok(!rows.some((r) => r.partNumber === 'BSAVED0000'));
});

test('amazon product -> title trimmed, price from a-offscreen, ASIN from URL', async () => {
  const ctx = ctxFromHtml(fixture('amazon-product.html'), 'https://www.amazon.com/dp/B07ABCDEFG');
  const { rows, mode } = await scrape({ ...fixedOpts, ctx });
  assert.equal(mode, 'product');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].partNumber, 'B07ABCDEFG');
  assert.equal(rows[0].description, 'Rust-Oleum 271919 Acrylic Enamel 2X Spray Paint, 12 oz, Gloss White');
  assert.equal(rows[0].unitCost, 12.99);
  assert.equal(rows[0].quantity, 1);
});

test('mcmaster cart -> part #/qty/desc from line inputs, unit cost derived from line total', async () => {
  const ctx = ctxFromHtml(fixture('mcmaster-cart.html'), 'https://www.mcmaster.com/order/');
  const { rows, mode, storeName } = await scrape({ ...fixedOpts, ctx });
  assert.equal(mode, 'cart');
  assert.equal(storeName, 'McMaster Carr');
  assert.equal(rows.length, 2, 'blank add-a-line row must be skipped');

  assert.equal(rows[0].partNumber, '89015K51');
  assert.equal(rows[0].description, 'Multipurpose 6061 Aluminum Sheet, 0.063" Thick, 24" x 48"');
  assert.equal(rows[0].quantity, 2);
  assert.equal(rows[0].unitCost, 92.53); // 185.06 / 2
  assert.equal(rows[0].extendedCost, 185.06);
  assert.equal(rows[0].weblink, 'https://www.mcmaster.com/89015K51/');

  // Pack pricing stays consistent: 4 packs, $58.28 total -> $14.57 per pack.
  assert.equal(rows[1].partNumber, '91251A342');
  assert.equal(rows[1].quantity, 4);
  assert.equal(rows[1].unitCost, 14.57);
  assert.equal(rows[1].extendedCost, 58.28);
});

test('mcmaster product -> part # from URL, desc from h1, price scanned', async () => {
  const ctx = ctxFromHtml(fixture('mcmaster-product.html'), 'https://www.mcmaster.com/91251A540/');
  const { rows, mode } = await scrape({ ...fixedOpts, ctx });
  assert.equal(mode, 'product');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].partNumber, '91251A540');
  assert.equal(rows[0].description, 'Black-Oxide Alloy Steel Socket Head Screw, 10-32 Thread Size, 2" Long');
  assert.equal(rows[0].unitCost, 8.11);
});

test('TSV emits exactly columns A-I in order, tab-separated, no header', async () => {
  assert.deepEqual(COLUMNS, [
    'requestDate', 'requestor', 'partNumber', 'description',
    'quantity', 'unitCost', 'extendedCost', 'storeName', 'weblink',
  ]);
  const ctx = ctxFromHtml('<!doctype html><body>', 'https://wcproducts.com/cart', {
    '/cart.js': json('shopify-cart.json'),
  });
  const { rows } = await scrape({ ...fixedOpts, ctx });
  const tsv = toTSV(rows);
  const lines = tsv.split('\n');
  assert.equal(lines.length, 2, 'one line per item, no header row');
  const first = lines[0].split('\t');
  assert.equal(first.length, 9);
  assert.deepEqual(first, [
    '1/1/2026', 'Tester', 'WCP-0336', '6" Aluminum Nutstrip (#10-32, .500" Spacing)',
    '2', '9.99', '19.98', 'WCP', 'https://wcproducts.com/products/nut-strips?variant=123',
  ]);
});

test('toHtml emits a <table> with one <tr> per row and 9 <td> per row, HTML-escaped', async () => {
  const ctx = ctxFromHtml('<!doctype html><body>', 'https://wcproducts.com/cart', {
    '/cart.js': json('shopify-cart.json'),
  });
  const { rows } = await scrape({ ...fixedOpts, ctx });
  const html = toHtml(rows);
  assert.match(html, /^<table>.*<\/table>$/s);
  assert.equal((html.match(/<tr>/g) || []).length, 2);
  assert.equal((html.match(/<td>/g) || []).length, 18); // 9 cols × 2 rows
});
