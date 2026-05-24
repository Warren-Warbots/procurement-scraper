# Procurement scraper

Scrapes the **cart** or the **single product page** you're viewing into clean
rows you paste straight into the team procurement sheet (columns A–I). One
scraper core, two ways to run it:

- **Bookmarklet** — desktop (click) and Android (type the bookmark name in the
  address bar, tap the suggestion).
- **iOS Shortcut** ("Run JavaScript on Web Page") — one-tap from the Share sheet.

Output for v1 is **TSV on the clipboard** → paste into the next empty row of the
sheet. The core (`scrape()`) only produces `{ rows, tsv }` — it does no I/O — so
the output step lives entirely in the wrappers (`copy()` in `bookmarklet.js`,
`completion(tsv)` in `shortcut.js`). A future team web app can replace that step
with a POST without touching any scraper code.

## Supported stores

| Store | How | Coverage of past orders |
|---|---|---|
| Any **Shopify** site (WCP, AndyMark, ThriftyBot, …) | `/cart.js` + `/products/<handle>.json` (no DOM scraping) | ~26% |
| **Amazon** | DOM scrape (cart + product) | ~29% |
| **McMaster-Carr** | DOM scrape (cart + product) | ~31% |

~83%+ of historical line items. Other stores (Rev/BigCommerce, DigiKey, …) are
out of scope for v1.

## Develop

```bash
npm install
npm test        # adapter + TSV tests via jsdom + node:test (no login needed)
npm run build   # -> dist/{bookmarklet.txt, shortcut-snippet.txt, install.html}
```

Open `dist/install.html` in a browser to install either wrapper (drag-to-bookmark
link + step-by-step iOS Shortcut setup).

## Layout

```
src/core/      scrape() -> {rows, tsv}; adapters/, normalize, tsv, dispatch, stores
src/wrappers/  bookmarklet.js (shadow-DOM overlay), shortcut.js (completion(tsv))
build.js       esbuild bundle+minify into the self-contained payloads
test/          fixtures + adapters.test.js
```

## Known limitations

- **Self-contained by design.** Amazon/McMaster ship strict CSP that blocks a
  bookmarklet from loading external code, so all logic is bundled into the
  payload. Updating the tool means teammates re-drag the bookmark / re-paste the
  Shortcut snippet from `install.html`.
- **Amazon/McMaster selectors are brittle** and were written against known DOM
  structure (the test fixtures mirror that structure). Verify against a real
  logged-in cart/product page and adjust the selectors in
  `src/core/adapters/{amazon,mcmaster}.js` if the sites have changed.
- **Requestor** is remembered per-origin in the bookmarklet (`localStorage`); the
  iOS Shortcut bakes it into the snippet's first line. Real identity belongs to
  the future endpoint.
- **Mobile clipboard** can be flaky in the bookmarklet — the overlay also shows
  the TSV in a selectable textarea as a fallback.
