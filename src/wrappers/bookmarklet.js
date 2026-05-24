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

import { scrape, toTSV, toHtml, recompute } from '../core/index.js';
import markSvg from '../../assets/warbotslogo-mono.svg';

const HOST = 'procurement-scraper-overlay';
const KEY = 'procReq.requestor';

// ── Warbots brand palette · MIRRORED LITERALS ──────────────────────────────
// This overlay renders on third-party store pages (WCP/Amazon/McMaster) inside
// a shadow root, styled via .style.cssText (CSSOM) because McMaster's CSP
// blocks <style> elements and inline style="" attrs. We therefore CANNOT link
// tokens.css here — values are mirrored as literals (same sanctioned pattern as
// sigint's tokens_css.py constant). Hand-sync this block on any palette change.
//   --wc-surge/card      #15203F   (--wc-surface)
//   --wc-text            #F5F1E8
//   --wc-text-dim        rgba(245,241,232,.62)
//   --wc-text-mute       rgba(245,241,232,.38)
//   --wc-border          rgba(255,255,255,.07)
//   --wc-border-hi       rgba(255,255,255,.14)
//   --wc-bg / btn-text   #0A1633
//   --wc-bg-deep / input #070F22
//   --wc-gold            #F0B842   --wc-gold-hover #E0A832
//   --wc-green           #7CD49B   --wc-red        #E85D5D
// Manrope can't load over a store's font-src CSP, so it leads a system fallback
// stack (graceful degradation; favicon is N/A on this injected surface).
const FONT = 'Manrope,-apple-system,system-ui,Segoe UI,Roboto,sans-serif';
const C = {
  gold: '#F0B842', goldHover: '#E0A832', green: '#7CD49B', red: '#E85D5D',
};
const S = {
  card: `box-sizing:border-box;width:min(420px,92vw);max-height:80vh;overflow:auto;background:#15203F;color:#F5F1E8;border:1px solid rgba(255,255,255,.14);border-radius:10px;box-shadow:0 30px 80px rgba(0,0,0,.5);padding:14px;font:13px/1.45 ${FONT};`,
  head: 'display:flex;align-items:center;gap:8px;margin-bottom:10px;',
  mark: 'color:#F5F1E8;display:flex;flex:0 0 auto;',
  count: 'font-size:15px;font-weight:700;',
  sub: 'color:rgba(245,241,232,.62);text-transform:capitalize;',
  close: 'margin-left:auto;border:0;background:none;font-size:20px;line-height:1;cursor:pointer;color:rgba(245,241,232,.38);',
  reqLabel: 'display:block;color:rgba(245,241,232,.62);margin-bottom:10px;',
  reqInput: `display:block;width:100%;margin-top:3px;padding:6px 8px;background:#070F22;color:#F5F1E8;border:1px solid rgba(255,255,255,.14);border-radius:6px;box-sizing:border-box;font:inherit;`,
  row: 'display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid rgba(255,255,255,.07);',
  main: 'flex:1;min-width:0;',
  desc: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
  meta: 'color:rgba(245,241,232,.38);font-size:11px;',
  qty: 'width:52px;padding:4px;background:#070F22;color:#F5F1E8;border:1px solid rgba(255,255,255,.14);border-radius:6px;font:inherit;text-align:center;box-sizing:border-box;',
  ext: 'width:72px;text-align:right;font-variant-numeric:tabular-nums;',
  actions: 'display:flex;align-items:center;gap:10px;margin-top:12px;',
  copy: 'background:#F0B842;color:#0A1633;border:0;border-radius:7px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer;',
  status: 'font-size:12px;',
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
  head.append(brandMark(), el('span', S.count, `${r.count} item${r.count === 1 ? '' : 's'}`), el('span', S.sub, `${r.storeName} · ${r.mode}`), close);

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
    });
    const tr = el('div', S.row);
    tr.append(m, qty, ext);
    table.append(tr);
  });

  // Actions
  const copyBtn = el('button', S.copy, 'Copy rows');
  copyBtn.onmouseenter = () => { copyBtn.style.background = C.goldHover; };
  copyBtn.onmouseleave = () => { copyBtn.style.background = C.gold; };
  const stat = el('span', S.status, '');
  const actions = el('div', S.actions);
  actions.append(copyBtn, stat);

  const setName = (n) => rows.forEach((x) => (x.requestor = n));
  setName(savedName);
  reqInput.addEventListener('input', () => setName(reqInput.value.trim()));

  copyBtn.onclick = async () => {
    const n = reqInput.value.trim();
    if (n) localStorage.setItem(KEY, n);
    setName(n);
    const ok = await copyRows(rows);
    stat.textContent = ok ? `Copied ${rows.length} row${rows.length === 1 ? '' : 's'} — paste into the sheet` : 'Copy failed — try again';
    stat.style.color = ok ? C.green : C.red;
  };

  card.append(head, reqLabel, table, actions);
}

// Put BOTH a TSV (text/plain) and an HTML table (text/html) on the clipboard.
// Sheets/Excel use the HTML table and lay it into cells reliably; plain-text
// targets get the TSV. Falls back to writeText, then a textarea select+copy.
async function copyRows(rows) {
  const tsv = toTSV(rows);
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
          'text/html': new Blob([toHtml(rows)], { type: 'text/html' }),
        }),
      ]);
      return true;
    }
  } catch {}
  try { await navigator.clipboard.writeText(tsv); return true; } catch {}
  // Last resort: a throwaway off-screen textarea + execCommand.
  try {
    const t = document.createElement('textarea');
    t.value = tsv;
    t.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(t);
    t.focus();
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  } catch { return false; }
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

// Warbots mono mark for the panel header. fill="currentColor" inherits the
// span's gold color. innerHTML (not a <style>/style attr) so a page's CSP
// can't strip it; size via CSSOM, consistent with the rest of this overlay.
function brandMark() {
  const span = el('span', S.mark);
  span.innerHTML = markSvg;
  const svg = span.querySelector('svg');
  if (svg) {
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.style.display = 'block';
  }
  return span;
}
