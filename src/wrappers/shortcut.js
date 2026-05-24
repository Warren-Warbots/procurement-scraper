// iOS Shortcut wrapper for the "Run JavaScript on Web Page" action. That action
// injects a global `completion()` to hand a value back to the Shortcut (which
// then copies it to the clipboard). The requestor name comes from the global
// PROC_REQUESTOR, which the build pins to the top of the snippet for the user to
// edit once; the `typeof` guard keeps it safe if left unset.

import { scrape } from '../core/index.js';

(async () => {
  const requestor = typeof PROC_REQUESTOR === 'string' ? PROC_REQUESTOR : '';
  try {
    const { tsv, count } = await scrape({ requestor });
    completion(count ? tsv : 'No items found on this page.');
  } catch (e) {
    completion('ERROR: ' + (e && e.message ? e.message : String(e)));
  }
})();
