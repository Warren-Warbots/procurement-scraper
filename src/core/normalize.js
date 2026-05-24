// Turns the loose items an adapter scrapes into the canonical LineItem shape
// that maps 1:1 onto sheet columns A-I. This is the single place that computes
// extended cost, applies the request date/requestor, and cleans the weblink.

import { num, round2, todayStr, canonicalUrl } from './util.js';

/**
 * @typedef {Object} RawItem
 * @property {string} [partNumber]
 * @property {string} [description]
 * @property {number|string} [quantity]
 * @property {number|string} [unitCost]
 * @property {string} [weblink]
 * @property {string} [storeName]   // adapter override (e.g. Shopify vendor)
 */

/**
 * @param {RawItem[]} items
 * @param {{storeName?:string, requestor?:string, requestDate?:string}} opts
 * @returns {LineItem[]}
 */
export function finalizeRows(items, opts = {}) {
  const requestDate = opts.requestDate || todayStr();
  const requestor = opts.requestor || '';
  return (items || []).map((it) => {
    const quantity = num(it.quantity, 1);
    const unitCost = round2(num(it.unitCost, 0));
    return {
      requestDate,
      requestor,
      partNumber: clean(it.partNumber),
      description: clean(it.description),
      quantity,
      unitCost,
      extendedCost: round2(quantity * unitCost),
      storeName: clean(it.storeName) || clean(opts.storeName),
      weblink: canonicalUrl(it.weblink),
    };
  });
}

/** Recompute the derived field after the user edits quantity in the overlay. */
export function recompute(row) {
  row.quantity = num(row.quantity, 1);
  row.extendedCost = round2(row.quantity * num(row.unitCost, 0));
  return row;
}

function clean(s) {
  return (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim();
}
