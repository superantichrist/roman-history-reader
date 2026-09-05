# Reader regression checks

Run `npm test` for permalink/TOC round trips across all 10,295 passages,
reading-line and swipe rules, search normalization/interleaving, and clipboard
success/denial/unavailability. `npm run validate` checks the source hashes and
every generated JSON without modifying files.

For browser checks, build with `NEXT_PUBLIC_BASE_PATH=/roman-history-reader`
and `npm run build:pages`, then run `node tests/serve-preview.mjs --faults`.
Open the exact local URL printed by the server. The first Livy 2 and Polybius
search requests intentionally fail; Polybius 2 loads slowly for race checks.
The `qaClipboard=blocked` query requests a clipboard-denied Permissions Policy;
browser automation may override it, so denial also has a deterministic unit test.

## Checked on 2026-09-05

- Desktop/mobile responsive widths: 320, 390, 430, 768, 1024, 1440 CSS pixels.
- Sticky controls, all three view modes, mobile source button, no horizontal overflow.
- Scroll position, repeated reload, base-URL revisit, resize, explicit navigation back/forward.
- Source filters, independent TOC filters, book/chapter pickers, joined chapter paragraphs.
- Mobile previous/next, the lost Polybius 17 volume, and navigation to volume 18.
- Search submit/Enter, exact reference, all-work interleaving, no results, failure/retry.
- Source dialog includes all 18 source records; native modal focus/Escape/body locking.
- Clipboard contains original, Korean, footnotes, chronology and passage permalink.
- Book failure/retry preserves the previous text; rapid book changes keep the last choice.

Responsive browser tests are not physical iPhone/Safari or Android tests.
Touch classification and clipboard denial are unit-tested; real-device touch,
OS clipboard permissions and mobile browser chrome still need device testing.
The complete corpus passes structural validation, not a claim that every
first-pass translation has received textual proofreading.
