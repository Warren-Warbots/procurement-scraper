// Serializes LineItems to TSV in the sheet's column order (A-I only). Columns
// J-M (Purchase Date, Receive Date, Receiver, Mentor Approval) are intentionally
// omitted so a paste at column A of a fresh row leaves the downstream stages
// untouched.

export const COLUMNS = [
  'requestDate',   // A: "F"
  'requestor',     // B
  'partNumber',    // C
  'description',   // D
  'quantity',      // E
  'unitCost',      // F
  'extendedCost',  // G
  'storeName',     // H
  'weblink',       // I
];

export function toTSV(rows) {
  return (rows || []).map((r) => COLUMNS.map((c) => cell(r[c])).join('\t')).join('\n');
}

// An HTML <table> mirror of the rows. Spreadsheets (Google Sheets, Excel) prefer
// text/html on the clipboard and lay it into cells reliably — far more robust
// than relying on tab-delimited plain text alone.
export function toHtml(rows) {
  const tr = (r) => `<tr>${COLUMNS.map((c) => `<td>${esc(cell(r[c]))}</td>`).join('')}</tr>`;
  return `<table>${(rows || []).map(tr).join('')}</table>`;
}

// Tabs and newlines would shift cells, so flatten any whitespace within a value.
function cell(v) {
  if (v == null) return '';
  return String(v).replace(/[\t\r\n]+/g, ' ').trim();
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
