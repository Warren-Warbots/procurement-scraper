// Pure scraper core: page in, data out. No DOM injection, no clipboard — that
// belongs to the wrappers. This is what lets one codebase serve both the
// bookmarklet and the iOS Shortcut.

import { detect } from './dispatch.js';
import { finalizeRows } from './normalize.js';
import { toTSV } from './tsv.js';

/** Build a context from the real page globals (browser/Shortcut runtime). */
export function browserCtx() {
  return {
    document,
    window,
    location: window.location,
    fetch: (...args) => window.fetch(...args),
  };
}

/**
 * Scrape the current page.
 * @param {{ctx?:object, requestor?:string, requestDate?:string}} [opts]
 * @returns {Promise<{rows:LineItem[], tsv:string, mode:string, storeName:string, store:string, count:number}>}
 */
export async function scrape(opts = {}) {
  const ctx = opts.ctx || browserCtx();
  const { adapter, key, mode, storeName } = detect(ctx);
  const raw = mode === 'product' ? await adapter.scrapeProduct(ctx) : await adapter.scrapeCart(ctx);
  const rows = finalizeRows(raw, { storeName, requestor: opts.requestor, requestDate: opts.requestDate });
  return { rows, tsv: toTSV(rows), mode, storeName, store: key, count: rows.length };
}

export { toTSV } from './tsv.js';
export { recompute } from './normalize.js';
