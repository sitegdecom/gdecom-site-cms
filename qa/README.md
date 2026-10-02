# GDECOM — QA harness

Test tooling only. Nothing in `qa/` is part of the published website.

**The suite tests the generated site in `dist/`**: run `npm run build` at the repository root first
(or `npm test` at the root, which builds and then runs this suite). `QA_SITE_ROOT=<folder>` tests another folder.
The baseline describes the final approved pre-launch site (see `baseline/` below): with unchanged content `dist/` must match it byte-for-byte.

## Requirements
- Node.js 18+
- Google Chrome installed locally (default). Alternatives: `QA_BROWSER_CHANNEL=msedge`, or `QA_CHROME_PATH=/path/to/chrome`.
- `npm install` inside `qa/` (single dev dependency: `playwright-core`, pinned in `package-lock.json`).

## Commands (run inside `qa/`)
| Command | What it does |
|---|---|
| `npm test` | All suites: static, integrity, browser, interaction |
| `npm run test:static` | Static + integrity checks only (seconds, no browser) |
| `npm run test:browser` | 14 pages × 6 viewports over HTTP + layout baseline comparison |
| `npm run test:interaction` | Keyboard/menu/lightbox/footer/404/privacy interactions |
| `npm run baseline:record` | **Re-records `baseline/` from the current state — only on an approved state** |
| `npm run serve` | Local static server (port 8765) with real HTTP 404 behaviour |

Exit code is `1` if any check fails; the full report is written to `qa/output/report.json` (git-ignored).

## Files
- `pages.json` — page manifest (file, URL, expected HTTP status, H1 count, type, robots, lightbox, gallery, interactions).
- `lib/server.js` — static server: directory → `index.html`; missing paths and non-site folders (`qa/`, `.git/`, `_archive_do_not_deploy/`, `.playwright-mcp/`) → `404.html` with HTTP 404.
- `lib/common.js` — viewports, browser launch, helpers.
- `tests/static.js` — files exist, local references and `srcset` resolve, links/anchors, H1, duplicate IDs, heading order, `alt`, robots, no canonical/og:url, privacy-date rule, footer privacy link; structure vs `baseline/structure.json`.
- `tests/integrity.js` — SHA-256 of the 14 HTML pages and protected shared CSS/JS vs `baseline/integrity.json`.
- `tests/browser.js` — HTTP status, console, failed local requests, overflow, broken images, H1/headings, page height, image boxes and chosen `srcset` candidates vs `baseline/layout.json` (±2px).
- `tests/interaction.js` — desktop navigation + Programas submenu (Tab, Escape, focus return, single navigation), mobile menu (Enter, Space, Escape, tap, tap-outside, single navigation), Home carousel lightbox, inline lightboxes, focus restoration, scroll preservation, footer Privacy Policy link, 404 and Privacy Policy specifics.
- `baseline/` — recorded from the final approved pre-launch state (built from commit `06e01a2`: CMS version plus the approved
  Vôlei and Home changes). The first baseline, from the pre-CMS site (commit `04f5031`), is in the git history.

## Notes
- Geometry excludes header/submenu images (they follow the sticky header) and carousel slides (they move); their `srcset` choice is still checked.
- The 404 page's own "Failed to load resource: 404" console line is expected and ignored only for the 404 test URL.
- Third-party request failures (Google Fonts/Maps when offline) are reported as notes, not failures.
- Known intermittent measurement: once, the Arte article at 360x800 measured 31px taller than its baseline (15329 vs 15298px)
  while its HTML/CSS were byte-identical. It did not reproduce in 20 later isolated measurements (fonts always loaded), so the
  test logic was left unchanged. If it reappears, re-run before treating it as a regression.
