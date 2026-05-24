// Bookmarklet wrapper: runs scrape() and shows a panel where the user can edit
// each line's quantity (extended cost updates live), set their requestor name,
// and copy the rows as TSV. Desktop-focused — the install page is hosted, so
// there's no bookmark-URL size limit to worry about.
//
// All UI is in a shadow root (page CSS can't leak in) and every element is
// styled via .style.cssText (CSSOM) — NOT inline style attributes or a shadow
// <style> — so a page's style-src CSP can't strip the styling. The host is
// lifted into the top layer (Popover API) so an ancestor `transform` can't
// knock position:fixed to the bottom of the page.

import { scrape, toTSV, recompute } from '../core/index.js';

const HOST = 'procurement-scraper-overlay';
const KEY = 'procReq.requestor';

const S = {
  card: 'box-sizing:border-box;width:min(420px,92vw);max-height:80vh;overflow:auto;background:#fff;color:#111;border:1px solid #d0d0d0;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.28);padding:14px;font:13px/1.45 -apple-system,system-ui,Segoe UI,Roboto,sans-serif;',
  head: 'display:flex;align-items:baseline;gap:8px;margin-bottom:10px;',
  count: 'font-size:15px;font-weight:700;',
  sub: 'color:#666;text-transform:capitalize;',
  close: 'margin-left:auto;border:0;background:none;font-size:20px;line-height:1;cursor:pointer;color:#888;',
  reqLabel: 'display:block;color:#444;margin-bottom:10px;',
  reqInput: 'display:block;width:100%;margin-top:3px;padding:6px 8px;border:1px solid #ccc;border-radius:6px;box-sizing:border-box;font:inherit;',
  row: 'display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #eee;',
  main: 'flex:1;min-width:0;',
  desc: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
  meta: 'color:#777;font-size:11px;',
  qty: 'width:52px;padding:4px;border:1px solid #ccc;border-radius:6px;font:inherit;text-align:center;box-sizing:border-box;',
  ext: 'width:72px;text-align:right;font-variant-numeric:tabular-nums;',
  actions: 'display:flex;align-items:center;gap:10px;margin-top:12px;',
  copy: 'background:#1a73e8;color:#fff;border:0;border-radius:7px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;',
  status: 'font-size:12px;',
  tsv: 'width:100%;height:72px;margin-top:10px;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;padding:6px;white-space:pre;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;',
  msg: 'padding:6px 2px;',
};

main().catch((e) => alert('Add to Procurement failed: ' + (e && e.message ? e.message : e)));

async function main() {
  const open = document.getElementById(HOST);
  if (open) { open.remove(); return; } // re-click toggles off
  const card = mount();
  message(card, 'Reading this page…');
  try {
    const saved = localStorage.getItem(KEY) || '';
    const r = await scrape({ requestor: saved });
    if (!r.count) { message(card, `No items found on this ${r.mode === 'product' ? 'product page' : 'cart'} (${r.storeName}).`); return; }
    render(card, r, saved);
  } catch (e) {
    message(card, `Couldn't scrape this page: ${e && e.message ? e.message : e}`);
  }
}

function render(card, r, savedName) {
  card.textContent = '';
  const rows = r.rows;

  // Header
  const close = el('button', S.close, '×');
  close.onclick = () => document.getElementById(HOST)?.remove();
  const head = el('div', S.head);
  head.append(el('span', S.count, `${r.count} item${r.count === 1 ? '' : 's'}`), el('span', S.sub, `${r.storeName} · ${r.mode}`), close);

  // Requestor
  const reqLabel = el('label', S.reqLabel, 'Requestor');
  const reqInput = el('input', S.reqInput);
  reqInput.type = 'text';
  reqInput.placeholder = 'Your name';
  reqInput.value = savedName;
  reqLabel.append(reqInput);

  // Editable per-line rows
  const table = el('div', '');
  rows.forEach((row) => {
    const m = el('div', S.main);
    m.append(
      el('div', S.desc, row.description || row.partNumber || '(no description)'),
      el('div', S.meta, `${row.partNumber || '—'} · $${row.unitCost.toFixed(2)} ea`)
    );
    const qty = el('input', S.qty);
    qty.type = 'number';
    qty.min = '0';
    qty.step = '1';
    qty.value = String(row.quantity);
    const ext = el('div', S.ext, `$${row.extendedCost.toFixed(2)}`);
    qty.addEventListener('input', () => {
      row.quantity = qty.value;
      recompute(row);
      ext.textContent = `$${row.extendedCost.toFixed(2)}`;
      refresh();
    });
    const tr = el('div', S.row);
    tr.append(m, qty, ext);
    table.append(tr);
  });

  // Actions + TSV preview
  const copyBtn = el('button', S.copy, 'Copy rows');
  const stat = el('span', S.status, '');
  const actions = el('div', S.actions);
  actions.append(copyBtn, stat);
  const ta = el('textarea', S.tsv);
  ta.readOnly = true;
  ta.spellcheck = false;
  ta.title = 'Paste this into the sheet';

  function refresh() { ta.value = toTSV(rows); }
  function setName(n) { rows.forEach((x) => (x.requestor = n)); refresh(); }
  setName(savedName);
  reqInput.addEventListener('input', () => setName(reqInput.value.trim()));

  copyBtn.onclick = async () => {
    const n = reqInput.value.trim();
    if (n) localStorage.setItem(KEY, n);
    setName(n);
    let ok;
    try { await navigator.clipboard.writeText(ta.value); ok = 1; }
    catch { ta.focus(); ta.select(); ok = document.execCommand('copy'); }
    stat.textContent = ok ? `Copied ${rows.length} row${rows.length === 1 ? '' : 's'} — paste into the sheet` : 'Select the text below and copy';
    stat.style.color = ok ? '#137333' : '#c5221f';
  };

  card.append(head, reqLabel, table, actions, ta);
}

function mount() {
  const host = el('div', 'position:fixed;inset:auto 16px 16px auto;z-index:2147483647;margin:0;padding:0;border:0;background:transparent;max-width:92vw;');
  host.id = HOST;
  const sh = host.attachShadow({ mode: 'open' });
  const card = el('div', S.card);
  sh.append(card);
  (document.body || document.documentElement).append(host);
  if (typeof host.showPopover === 'function') {
    host.setAttribute('popover', 'manual');
    try { host.showPopover(); } catch {}
  }
  return card;
}

function message(card, text) {
  card.textContent = '';
  card.append(el('div', S.msg, text));
}

function el(tag, css, text) {
  const n = document.createElement(tag);
  if (css) n.style.cssText = css;
  if (text != null) n.textContent = text;
  return n;
}
