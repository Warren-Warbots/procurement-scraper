// Small shared helpers. No DOM or network access here.

/** Coerce to a finite number, falling back to `fallback`. Strips $ , and whitespace. */
export function num(v, fallback = 0) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (v == null) return fallback;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

/** Round to 2 decimal places, returned as a number. */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Today's date as the sheet shows it (US M/D/YYYY). Google Sheets parses this as a date on paste. */
export function todayStr(date = new Date()) {
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

const TRACKER = /^(utm_|ref$|ref_|_ga$|gclid|fbclid|mc_[ce]id|psc$|th$)/i;

/**
 * Return an absolute, tracking-free URL string. Keeps meaningful params like
 * Shopify's `?variant=`. Falls back to the trimmed input if it can't parse.
 */
export function canonicalUrl(u, base) {
  if (!u) return '';
  try {
    const url = new URL(u, base);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKER.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return String(u).trim();
  }
}

/** Collapse a host like "www.wcproducts.com" to "wcproducts.com". */
export function bareHost(hostname) {
  return String(hostname || '').replace(/^www\./, '').toLowerCase();
}
