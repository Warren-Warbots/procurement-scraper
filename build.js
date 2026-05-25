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
import { writeFileSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
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
    // Inline the brand mono mark (assets/warbotslogo-mono.svg) as a string so
    // the overlay can render it; keeps a single source for the asset.
    loader: { '.svg': 'text' },
  });
  return result.outputFiles[0].text.trim();
}

const bookmarkletCode = await bundle('src/wrappers/bookmarklet.js', { minify: true });
// Escape only the chars that break a bookmark URL (% and #); spaces are tolerated.
const bookmarkletUrl = 'javascript:' + bookmarkletCode.replace(/%/g, '%25').replace(/#/g, '%23');

const shortcutCode = await bundle('src/wrappers/shortcut.js', { minify: true });
const shortcutSnippet = `// Put your name between the quotes, then leave the rest as-is:\nvar PROC_REQUESTOR = "";\n${shortcutCode}`;

// Brand mono mark (line-art), inlined into the install-page header
// (fill:currentColor → colored white by CSS). Strip the intrinsic width/height so CSS sizes it.
const monoMark = readFileSync(join(root, 'assets/warbotslogo-mono.svg'), 'utf8')
  .replace(/\s+width="[^"]*"\s+height="[^"]*"/, '')
  .trim();

const installPage = installHtml(bookmarkletUrl, VERSION, monoMark);

// dist/ holds all build artifacts; docs/ is what GitHub Pages publishes.
const docs = join(root, 'docs');
mkdirSync(docs, { recursive: true });

// Sync the brand standard into the published tree: canonical tokens.css +
// favicon. tokens.css and assets/ at repo root are byte-faithful copies of
// ~/.warbots-coord (the synced-file delivery model); never hand-edit them.
mkdirSync(join(docs, 'assets'), { recursive: true });
copyFileSync(join(root, 'tokens.css'), join(docs, 'tokens.css'));
copyFileSync(join(root, 'assets/favicon.svg'), join(docs, 'assets/favicon.svg'));
copyFileSync(join(root, 'assets/warbotslogo-mono.svg'), join(docs, 'assets/warbotslogo-mono.svg'));

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

function installHtml(bmUrl, version, monoMark) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Add to Procurement — install</title>
<link rel="icon" href="assets/favicon.svg" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="tokens.css" />
<style>
  /* tokens.css sets bg/text/font on html,body. Page-specific layout only. */
  body { max-width: 680px; margin: 40px auto; padding: 0 18px; font-size: var(--wc-fs-15); line-height: var(--wc-leading-relaxed); }
  .brand { display: flex; align-items: center; gap: var(--wc-space-3); margin-bottom: var(--wc-space-2); }
  .brand .mark { color: var(--wc-text); display: flex; flex: 0 0 auto; }
  .brand .mark svg { width: 34px; height: 34px; display: block; }
  h1 { font-family: var(--wc-font-sans); font-weight: var(--wc-fw-extrabold); font-size: var(--wc-fs-32); letter-spacing: var(--wc-tracking-title); line-height: var(--wc-leading-tight); margin: 0; }
  h2 { margin-top: var(--wc-space-8); font-size: var(--wc-fs-18); letter-spacing: var(--wc-tracking-title); }
  a { color: var(--wc-blue); }
  .bm { display: inline-block; background: var(--wc-gold); color: var(--wc-bg); text-decoration: none; padding: 11px 20px; border-radius: var(--wc-radius-lg); font-weight: var(--wc-fw-bold); }
  .bm:hover { background: var(--wc-gold-hover); }
  ol { padding-left: 20px; } li { margin: 7px 0; }
  code { background: var(--wc-panel-hi); border: 1px solid var(--wc-border); padding: 1px 5px; border-radius: var(--wc-radius-sm); }
  .tag { color: var(--wc-text-mute); font-size: var(--wc-fs-13); }
  .note { background: var(--wc-surface); border: 1px solid var(--wc-border); border-radius: var(--wc-radius-lg); padding: 10px 14px; color: var(--wc-text-dim); }
  pre { background: var(--wc-bg-deep); color: var(--wc-text); border: 1px solid var(--wc-border); padding: 12px; border-radius: var(--wc-radius-lg); overflow: auto; font: 12px/1.4 ui-monospace, Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-all; }
  button { font: inherit; padding: 6px 12px; border: 1px solid var(--wc-border); border-radius: var(--wc-radius-md); background: transparent; color: var(--wc-text); cursor: pointer; }
  button:hover { border-color: var(--wc-border-hi); }
</style>
</head>
<body>
  <header class="brand"><span class="mark">${monoMark}</span><h1>Add to Procurement</h1><span class="tag">v${version}</span></header>
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
