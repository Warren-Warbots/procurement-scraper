// Picks the adapter for the current host and decides cart-vs-product mode from
// the URL path.

import * as shopify from './adapters/shopify.js';
import * as amazon from './adapters/amazon.js';
import * as mcmaster from './adapters/mcmaster.js';
import { adapterKeyForHost, shopifyStoreName, STORE_NAMES } from './stores.js';

const ADAPTERS = { shopify, amazon, mcmaster };

export function detect(ctx) {
  const key = adapterKeyForHost(ctx.location.hostname);
  const storeName = key === 'shopify' ? shopifyStoreName(ctx.location.hostname) : STORE_NAMES[key];
  return { adapter: ADAPTERS[key], key, mode: modeFor(key, ctx), storeName };
}

function modeFor(key, ctx) {
  const path = ctx.location.pathname || '';
  if (key === 'amazon') return /\/(?:dp|gp\/product|gp\/aw\/d)\//i.test(path) ? 'product' : 'cart';
  if (key === 'mcmaster') return /^\/\d{3,6}[A-Z]\d{2,6}[A-Z0-9]*\/?$/i.test(path) ? 'product' : 'cart';
  // shopify: a /products/ path is a single product; anything else -> read the cart.
  return /\/products\//.test(path) ? 'product' : 'cart';
}
