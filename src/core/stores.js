// Maps a host to the store display name used in the procurement sheet, and
// classifies which adapter handles it. Names match the existing sheet values
// ("McMaster Carr", "WCP", "Andy Mark", "Thrifty Bot") so rows stay consistent.

import { bareHost } from './util.js';

// Known Shopify FRC vendors -> the label already used in the sheet.
const SHOPIFY_NAMES = {
  'wcproducts.com': 'WCP',
  'andymark.com': 'Andy Mark',
  'thethriftybot.com': 'Thrifty Bot',
};

/**
 * Decide which adapter handles a host: 'amazon' | 'mcmaster' | 'shopify'.
 * Anything not Amazon/McMaster is treated as Shopify (the adapter confirms by
 * actually hitting /cart.js and surfaces a clear error if it isn't one).
 */
export function adapterKeyForHost(hostname) {
  const host = bareHost(hostname);
  if (/(^|\.)amazon\./.test(host)) return 'amazon';
  if (/(^|\.)mcmaster\.com$/.test(host)) return 'mcmaster';
  return 'shopify';
}

/** Display name for a Shopify host: known vendor, else the host's first label. */
export function shopifyStoreName(hostname) {
  const host = bareHost(hostname);
  return SHOPIFY_NAMES[host] || host.split('.')[0];
}

export const STORE_NAMES = {
  amazon: 'Amazon',
  mcmaster: 'McMaster Carr',
};
