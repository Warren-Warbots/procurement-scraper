// Slim bookmarklet wrapper — small enough to paste into an Android bookmark URL.
// Requestor is asked via prompt() (no input element); results show in a tiny
// editable TSV textarea (tweak any value before copying) with a Copy button.
// Styles are set via .style.cssText (CSSOM) — NOT inline style attributes — so
// a page's style-src CSP can't strip them (that bit us before on McMaster).

import { scrape, toTSV } from '../core/index.js';

const H = 'procurement-scraper-overlay';
const K = 'procReq.requestor';

go().catch((e) => alert('Add to Procurement: ' + (e && e.message ? e.message : e)));

async function go() {
  const open = document.getElementById(H);
  if (open) { open.remove(); return; }
  const saved = localStorage.getItem(K) || '';
  const r = await scrape({ requestor: saved });
  if (!r.count) { alert(`No items found (${r.storeName}).`); return; }

  const who = prompt(`${r.count} item(s) from ${r.storeName}. Requestor name:`, saved);
  if (who != null && who.trim()) {
    localStorage.setItem(K, who.trim());
    r.rows.forEach((x) => (x.requestor = who.trim()));
  }

  const host = el('div', 'position:fixed;inset:auto 12px 12px auto;z-index:2147483647;max-width:94vw');
  host.id = H;
  const sh = host.attachShadow({ mode: 'open' });
  const card = el('div', 'box-sizing:border-box;width:min(380px,94vw);background:#fff;color:#111;border:1px solid #ccc;border-radius:8px;padding:10px;font:13px system-ui,sans-serif');
  const x = el('button', 'float:right;border:0;background:0;font-size:16px;cursor:pointer', '×');
  x.onclick = () => host.remove();
  const ta = el('textarea', 'width:100%;height:110px;margin-top:6px;box-sizing:border-box;white-space:pre;font:11px ui-monospace,monospace');
  ta.value = toTSV(r.rows);
  const copy = el('button', 'margin-top:6px;background:#1a73e8;color:#fff;border:0;border-radius:6px;padding:7px 12px;font:inherit;cursor:pointer', 'Copy rows');
  const stat = el('span', 'margin-left:8px;font-size:12px', '');
  copy.onclick = async () => {
    let ok;
    try { await navigator.clipboard.writeText(ta.value); ok = 1; }
    catch { ta.focus(); ta.select(); ok = document.execCommand('copy'); }
    stat.textContent = ok ? 'Copied — paste into the sheet' : 'Select text & copy';
  };
  card.append(el('b', '', `${r.count} rows · ${r.storeName}`), x, ta, copy, stat);
  sh.append(card);
  (document.body || document.documentElement).append(host);
  if (host.showPopover) { host.setAttribute('popover', 'manual'); try { host.showPopover(); } catch {} }
}

function el(tag, css, text) {
  const n = document.createElement(tag);
  if (css) n.style.cssText = css;
  if (text != null) n.textContent = text;
  return n;
}
