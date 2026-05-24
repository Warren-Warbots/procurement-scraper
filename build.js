// Bundles the bookmarklet and emits:
//   dist/bookmarklet.txt        the self-contained javascript: URL (desktop)
//   dist/wix-http-functions.js  paste into the Wix backend to HOST the install page
//   dist/install.html           local copy of the install page
//   dist/shortcut-snippet.txt   iOS Shortcut JS (optional; not linked from the page)
//
// Distribution: desktop only. Teammates open the hosted install page
// (team9408.com/_functions/install) and drag the bookmarklet to their bookmarks
// bar. The bookmarklet is self-contained (a bookmarklet's own code is exempt
// from page CSP), so it works on WCP, Amazon, and McMaster alike. No loader —
// strict-CSP sites block externally-loaded code, and the mobile path is parked.

import esbuild from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const VERSION = process.env.npm_package_version || '0.1.0';
const INSTALL_URL = 'https://req.team9408.com';
const CUSTOM_DOMAIN = 'req.team9408.com';

async function bundle(entry, { minify }) {
  const result = await esbuild.build({
    entryPoints: [join(root, entry)],
    bundle: true,
    minify,
    format: 'iife',
    target: ['es2020'],
    write: false,
    legalComments: 'none',
  });
  return result.outputFiles[0].text.trim();
}

const bookmarkletCode = await bundle('src/wrappers/bookmarklet.js', { minify: true });
// Escape only the chars that break a bookmark URL (% and #); spaces are tolerated.
const bookmarkletUrl = 'javascript:' + bookmarkletCode.replace(/%/g, '%25').replace(/#/g, '%23');

const shortcutCode = await bundle('src/wrappers/shortcut.js', { minify: true });
const shortcutSnippet = `// Put your name between the quotes, then leave the rest as-is:\nvar PROC_REQUESTOR = "";\n${shortcutCode}`;

const installPage = installHtml(bookmarkletUrl, VERSION);

// dist/ holds all build artifacts; docs/ is what GitHub Pages publishes.
const docs = join(root, 'docs');
mkdirSync(docs, { recursive: true });

writeFileSync(join(dist, 'bookmarklet.txt'), bookmarkletUrl);
writeFileSync(join(dist, 'install.html'), installPage);
writeFileSync(join(dist, 'shortcut-snippet.txt'), shortcutSnippet);
writeFileSync(join(docs, 'index.html'), installPage);
writeFileSync(join(docs, 'CNAME'), CUSTOM_DOMAIN + '\n');

console.log(`Built v${VERSION}`);
console.log(`  bookmarklet:  ${bookmarkletUrl.length} chars`);
console.log(`  install page: ${installPage.length} chars`);
console.log(`  docs/ -> GitHub Pages, custom domain ${CUSTOM_DOMAIN} -> ${INSTALL_URL}`);

// --- install page ---

function installHtml(bmUrl, version) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Add to Procurement — install</title>
<style>
  body { font: 15px/1.6 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 18px; color: #1a1a1a; }
  h1 { font-size: 24px; } h2 { margin-top: 30px; }
  .bm { display: inline-block; background: #1a73e8; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 8px; font-weight: 600; }
  ol { padding-left: 20px; } li { margin: 7px 0; }
  code { background: #f0f0f0; padding: 1px 5px; border-radius: 4px; }
  .tag { color: #888; font-size: 13px; }
  .note { background: #f6f8fa; border: 1px solid #e3e6ea; border-radius: 8px; padding: 10px 14px; color: #444; }
  pre { background: #0d1117; color: #e6edf3; padding: 12px; border-radius: 8px; overflow: auto; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-all; }
  button { font: inherit; padding: 6px 12px; border: 1px solid #ccc; border-radius: 6px; background: #fafafa; cursor: pointer; }
</style>
</head>
<body>
  <h1>Add to Procurement <span class="tag">v${version}</span></h1>
  <p>Turns the cart or product page you're on into rows you paste straight into the procurement sheet (columns A–I). Works on <strong>McMaster-Carr, Amazon, and any Shopify store</strong> (WCP, AndyMark, ThriftyBot…).</p>

  <h2>Install (desktop Chrome / Edge)</h2>
  <ol>
    <li>Show your bookmarks bar: <code>Ctrl/Cmd + Shift + B</code>.</li>
    <li><strong>Drag this button onto the bookmarks bar:</strong></li>
  </ol>
  <p style="margin-left:20px"><a class="bm" href="${escapeAttr(bmUrl)}">➕ Add to Procurement</a></p>

  <h2>Use it</h2>
  <ol>
    <li>On a cart or product page, click the <strong>Add to Procurement</strong> bookmark.</li>
    <li>Enter your name when prompted, then click <strong>Copy rows</strong>.</li>
    <li>In the procurement sheet, click the first empty cell in <strong>column A</strong> and paste.</li>
  </ol>

  <p class="note"><strong>Desktop only for now.</strong> Phones can't run bookmarklets reliably (and stores like McMaster block hosted scripts via CSP), so the mobile path is parked. Do procurement entry from a computer.</p>

  <details><summary>Manual install / raw bookmarklet link</summary><pre id="bm">${escapeHtml(bmUrl)}</pre><button onclick="copyEl('bm')">Copy link</button></details>

  <script>
    function copyEl(id){ navigator.clipboard.writeText(document.getElementById(id).textContent); }
  </script>
</body>
</html>
`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
