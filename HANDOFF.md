# Procurement Scraper — Project Handoff

Status: **working prototype, desktop verified on WCP + McMaster; Amazon unverified.**
Code lives at `/home/warbot/outpost/procurement-scraper` (Node, esbuild + `node:test`).
Current version: `0.4.0`. There is also a higher-level plan at
`~/.claude/plans/lets-not-worry-about-sequential-stream.md`.

---

## 1. Goal

The robotics team (FRC #9408) logs every purchase request as a row in a Google
Sheet ("procurement doc"). Adding items by hand is slow and error-prone. This
tool scrapes the **current shopping cart or product page** in the browser and
produces clean, structured rows the user pastes straight into the sheet.

**The final storage target is intentionally deferred.** v1 output is
tab-separated rows on the clipboard → paste into the sheet. Later the team may
build their own web app to replace the sheet; the scraper core already keeps
output behind a thin seam so that swap is easy.

---

## 2. The procurement document (data model)

Source analyzed: `../procurement_doc.xlsx` (the team's sheet, exported to xlsx).
868 line items. Columns:

| Col | Header | Notes |
|----|--------|-------|
| A | "F" | Request date (Excel serial, e.g. `45520` → 2024-08-16); rows arrive in same-date batches |
| B | Requestor | student name |
| C | Part Number | |
| D | Description | |
| E | Quantity | |
| F | Unit Cost | |
| G | Extended Cost | = Qty × Unit (98% filled, mechanical) |
| H | Store Name | |
| I | Weblink | **25% are pasted hyperlink *titles*, not URLs** — the core friction |
| J–M | Purchase Date / Receive Date / Receiver / Mentor Approval | later-stage fields, sparse |

**Store distribution (why scope is small):** McMaster-Carr 269, Amazon 252,
WCP 198 = **~83% of all rows**. Long tail: AndyMark 10, Rev 6, DigiKey 5, etc.

---

## 3. Architecture

A **pure core** (`src/core/`) that takes the page and returns data, plus thin
**wrappers** that handle I/O. This is what lets one codebase serve a bookmarklet
and (optionally) an iOS Shortcut.

```
scrape(opts) -> { rows: LineItem[], tsv, mode: 'cart'|'product', storeName, count }
```

- `core/dispatch.js` — picks adapter by hostname, cart-vs-product by URL path.
- `core/adapters/{shopify,amazon,mcmaster}.js` — each has `scrapeCart()` + `scrapeProduct()`.
- `core/normalize.js` — builds the canonical `LineItem`, computes extended cost, cleans URLs.
- `core/tsv.js` — serializes to TSV in **sheet column order A–I only**.
- `core/index.js` — `scrape()` orchestrator; `browserCtx()` reads real page globals.

`LineItem` = `{ requestDate, requestor, partNumber, description, quantity, unitCost, extendedCost, storeName, weblink }`.

The core never touches the DOM-as-output or clipboard; wrappers do.

---

## 4. Store adapters & coverage

All scraping runs **client-side in the user's logged-in browser** (carts are
behind login; Amazon/McMaster block server-side fetching; same-origin lets
Shopify endpoints use the user's cookies).

| Adapter | Stores | Cart | Product | Verified live? |
|---|---|---|---|---|
| `shopify` | WCP, AndyMark, ThriftyBot, any Shopify | `fetch('/cart.js')` | `fetch('/products/<handle>.js')` (falls back to `.json`) | ✅ WCP cart + product |
| `mcmaster` | mcmaster.com | DOM via line inputs | DOM (part # from URL, price scan) | ✅ cart (qty+cost) |
| `amazon` | amazon.* | DOM (active cart items) | DOM (`#productTitle`, price, ASIN) | ❌ not verified on a live logged-in page |

**Shopify specifics:** `/cart.js` prices are integer **cents**; `/products/<h>.js`
(and legacy `.json`) prices may be **dollar strings** — discriminate by type
(`typeof === 'number'` → cents).

**McMaster specifics (confirmed against the live page):** each cart line exposes
stable input classes:
`input.line-part-number-input`, `input.line-quantity-input`, `div.line-total-price`.
Unit cost is **derived = line total ÷ quantity** (the total is reliably classed;
the per-unit price div has no class). This keeps "Packs of N" lines consistent
(e.g. 4 packs, $58.28 total → $14.57/pack).

**Amazon:** selectors written from known DOM structure (`#sc-active-cart`,
`.sc-list-item[data-asin]`, `.sc-product-price`, `.sc-quantity-textfield`,
`#productTitle`, `.a-price .a-offscreen`). Fixture tests pass, **but these need a
real-page pass** — Amazon A/B-tests its markup. This is the top open task.

---

## 5. Output: TSV → sheet

`tsv.js` emits **columns A–I only**, tab-separated, no header row, so a paste at
column A of a fresh row aligns and leaves the later-stage columns (J–M) untouched.
Request date is emitted as `M/D/YYYY` (Google Sheets parses it as a date).

---

## 6. Distribution — the journey and where we landed

This is where most of the back-and-forth happened; read this before changing the
delivery mechanism.

### 6a. The bookmarklet works everywhere — because it's self-contained
A bookmarklet's own `javascript:` code (run on click) is **exempt from the page's
CSP**. So a self-contained bookmarklet scrapes WCP, McMaster, and Amazon fine.
Confirmed empirically (McMaster has a strict CSP yet the bookmarklet runs).

### 6b. Why a hosted "loader" was abandoned
To make a tiny bookmarklet for mobile, we tried a ~400–570 char **loader** that
injects the real code from a hosted URL. This is blocked on strict-CSP sites:
- **McMaster's cart** ships a CSP via a **`<meta>` tag** (invisible to HTTP-header
  checks) with `script-src 'self' *.mcmaster.com … 'nonce-…'` and **no
  `unsafe-eval`** → external `<script src>` and `eval` are both blocked.
- **Amazon** is almost certainly the same.
- **WCP/Shopify** send no script CSP → loader works there.

A **nonce-reuse trick** (read the page's `.nonce`, set it on the injected script
so CSP allows it) was tried: **worked on WCP, failed on McMaster** in testing.
Conclusion: there is no reliable tiny-loader that works on McMaster/Amazon. The
**self-contained bookmarklet is the only thing that works on all stores.**

### 6c. Mobile status: PARKED
- Chrome on **Android** has no extensions and truncates long bookmark URLs
  (limit ~8192 chars). The self-contained bookmarklet is ~9.2 KB even slimmed,
  and the loader (which would fit) is CSP-blocked on McMaster/Amazon. Chrome
  **Sync** can carry the full bookmarklet to one's own phone, but not to a team.
- **iOS** Shortcut ("Run JavaScript on Web Page") is CSP-exempt and viable
  one-tap, but de-prioritized.
- **Decision: desktop-only for now.** Procurement entry happens at a computer.

### 6d. Hosting decision (current)
Host the **install page** at **`req.team9408.com`** so teammates just visit a link
and drag the bookmarklet.
- Wix **cannot** serve a bare-subdomain tool page cleanly (its subdomain feature
  only points to another Wix site; raw HTML needs Velo `/_functions/...` or a
  sandboxed iframe embed).
- An interim option was a **Wix Velo HTTP function** returning the page at
  `team9408.com/_functions/install` — works, but ugly URL. **Superseded.**
- **Chosen path: a free static host at `req.team9408.com`.** DNS is on **Wix**
  (owner is comfortable adding a CNAME).
- **Recommended host: Cloudflare Pages** (or Netlify). Reason: both deploy from a
  **private** repo for **free**; **GitHub Pages requires a public repo unless on
  a paid plan**. Cloudflare also has Functions/Workers for the future web app.

`dist/index.html` is the deployable page (it's a copy of `install.html`, works at
the bare subdomain). `dist/wix-http-functions.js` (the Velo route) is now
**legacy** — keep only if they want the `/_functions/install` interim URL.

---

## 7. Key technical learnings / gotchas

- **CSP & bookmarklets:** clicked `javascript:` code is CSP-exempt;
  externally-loaded code (script src / eval / import) is not. McMaster/Amazon set
  CSP via `<meta>`, so HTTP-header CSP checks miss it.
- **Shadow-DOM styling:** a shadow `<style>` / `adoptedStyleSheets` silently
  failed to apply on some store themes (panel rendered unstyled). **Setting
  styles inline via `element.style.cssText` (CSSOM) is reliable and not subject
  to `style-src` CSP.** The overlay now uses inline styles only.
- **Fixed positioning:** an ancestor `transform` (common in themes like WCP's
  Wokiee) breaks `position: fixed` (anchors to the page, not viewport). Fix:
  lift the host into the **top layer** via the Popover API (`showPopover()`).
- **Bookmarklet URL size:** Android limit ~8192. `encodeURIComponent` inflates
  ~40%; we escape only `%` and `#` (spaces are tolerated). Target `es2020` so
  `?.`/`??` aren't transpiled.
- **Shopify price units** differ between `/cart.js` (cents) and product JSON
  (dollar strings) — discriminate by type.

---

## 8. Current status & verification

- **Tests:** `npm test` → 7 passing (`node:test` + jsdom against
  `test/fixtures/`), covering each adapter's cart + product, price math, store
  mapping, URL canonicalization, and exact A–I TSV column order.
- **Live-verified:** WCP cart + product; McMaster cart (qty + per-pack cost).
- **Not verified:** Amazon (selectors are best-effort), iOS Shortcut path.

---

## 9. Open items / next steps (priority order)

1. **Verify Amazon** on a real logged-in cart + a product page; fix the selectors
   in `src/core/adapters/amazon.js` if needed (fixtures mirror current selectors).
2. **Stand up `req.team9408.com`** on Cloudflare Pages:
   - Option A: push this project to a **private repo in the team's GitHub org**,
     connect Cloudflare Pages (build output dir `dist`). (Org name TBD; can push
     via `gh` with the owner logged in.)
   - Option B: **Direct Upload** `dist/` to Cloudflare Pages (no repo to start).
   - Add custom domain `req.team9408.com` → Cloudflare gives a `*.pages.dev` CNAME
     target → owner adds `CNAME req → …pages.dev` in **Wix DNS** (owner is comfy
     with this). HTTPS auto-provisions.
3. **Decide on the private repo / org** for source control + auto-deploys.
4. **Re-enable iOS Shortcut** for iPhone users if mobile demand returns
   (`src/wrappers/shortcut.js` exists; `dist/shortcut-snippet.txt` is generated).
5. **The write target** (final destination of rows) remains deferred — wire the
   future web app's ingest endpoint into the output seam when it exists.

---

## 10. Repo layout, build & test

```
procurement-scraper/
  src/
    core/
      index.js          # scrape() -> {rows, tsv}
      dispatch.js       # hostname + page-type -> adapter + mode
      adapters/{shopify,amazon,mcmaster}.js
      normalize.js, tsv.js, stores.js, util.js
    wrappers/
      bookmarklet.js    # slim: prompt name -> shadow-DOM/top-layer overlay
                        #       (editable TSV textarea + Copy); inline styles
      shortcut.js       # iOS "Run JavaScript on Web Page" (optional)
  build.js              # esbuild bundle+minify -> dist/*
  dist/
    bookmarklet.txt     # self-contained javascript: URL (desktop)
    install.html        # install page (drag bookmarklet + instructions)
    index.html          # deployable copy for the static host (== install.html)
    wix-http-functions.js  # LEGACY Velo route (interim /_functions/install)
    shortcut-snippet.txt
  test/
    fixtures/           # shopify cart+product JSON; amazon+mcmaster cart+product HTML
    adapters.test.js
  package.json
```

```bash
npm install          # esbuild + jsdom
npm test             # 7 tests, no login needed
npm run build        # regenerates dist/*
```

Manual test: open `dist/install.html`, drag the bookmarklet to the bookmarks bar,
click it on a cart/product page, set name, Copy rows, paste into column A of a
scratch sheet.

---

## 11. Deferred: the write target

v1 = clipboard → manual paste. The core returns `{ rows, tsv }` and does no I/O;
the wrapper performs the clipboard write. To move to a real backend later
(e.g. the team's own web app at `req.team9408.com`), add a sink that POSTs `rows`
— no scraper changes required. The `req.team9408.com` static host can grow into
that web app (Cloudflare Pages + Functions).
