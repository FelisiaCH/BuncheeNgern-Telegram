# BuncheeNgern v2 — Phase 0 skeleton

Implements only what `bcn-v2-system-design.md` §10 lists for **Phase 0**
("Skeleton project, tokens, base CSS, store, api, i18n port" — risk: none).
Nothing here is reachable by real users: v1 (`/index.html` + `css/app.css` +
`js/*.js`) is completely unmodified, still the only thing deployed, and
still the only thing referenced by `service-worker.js`'s `ASSETS`.

## What's here and why

| File | Status | Notes |
|---|---|---|
| `css/tokens.css` | Ported | v1's exact primitives/scales/semantic values (`css/app.css`'s `:root` + `[data-theme="light"]`), unchanged. §9 says this architecture "worked" — reused, not redesigned. The customisable accent-preset picker in §9 is Phase 3; `--accent` is still one fixed value. |
| `css/base.css` | Ported + gap flagged | Reset, `html`/`body`, `.hidden`/`.screen`. The Thai/Lao line-height/font-stack work §9 calls "new and overdue" is **not done** — the doc gives no concrete values, and this needs real testing against Lao text, not a guess. Flagged inline with a comment; block before Phase 3 ships without it. |
| `js/store.js` | Built | Minimal `get()/set(patch)/subscribe(fn)`, per §7 point 1. No middleware, no derived state — not asked for. |
| `js/api.js` | Ported | `_apiFetch`/`_checkAuthError`/`apiGet`/`apiPost`/`apiAuthenticate`, straight from `js/session.js`. Same timeout (15s), same error strings, same `AUTH_EXPIRED`/`AUTH_DENIED` handling — that behaviour is proven in production and wasn't touched. DOM coupling removed: auth loss clears `store`'s `sessionToken`, doesn't reach into a screen directly. **No XHR / upload progress** — impossible against this backend (CORS preflight, Apps Script doesn't answer `OPTIONS`), see `CLAUDE.md`. |
| `js/i18n.js` | Ported | `t()`/`setLang()`/generic `data-i18n*` DOM application, from `js/core.js`. The 18 language files and `i18n/build.js` are **not duplicated** — `v2/index.html` loads them from the existing top-level `i18n/` directory, per §2 ("carry over unchanged"). Screen-specific re-render calls v1's `applyTranslations()` made directly (`renderBranchSegments`, `refreshDashUI`, ...) are gone; a lang change is just `store.set()` and screens subscribe when they exist. |
| `index.html` | Skeleton | Loads the above, runs a visible sanity check (`store`/`api`/`i18n` wired correctly), nothing else. Nothing reachable by real users. |

## Deliberately not built yet

Everything else in the design doc needs its own concrete spec before code
gets written — same discipline as every other change this session (a
markdown change-request with exact scope, verified, one commit). This
document is a system design, not a change request; treating its whole
five-phase table as one instruction to implement in a single pass would mean
inventing a long list of product/architecture decisions the doc leaves open
(exact toggle-form layout, dashboard tile visuals, accent presets, Thai/Lao
metric values, `getRangeData`'s real implementation) on an app that handles
real money. That's the opposite of §1's "correctness over features."

Not built:
- `cache.js` — client cache port. §2 says it carries over, but Phase 0's own
  row in §10 doesn't list it, and it has nothing to do until a dashboard
  exists to call it (Phase 2).
- `ui.js`, `entry.js`, `dashboard.js`, `settings.js`, `charts.js` — Phases 1–3.
- `css/components.css`, `css/dashboard.css` — Phases 1–3.
- The `getRangeData` backend endpoint (§6) — Phase 2, requires an Apps Script
  redeploy, out of scope for a frontend-only phase.
- Payment toggles, the slip-rule fix, inline add-currency (§4) — Phase 1.
- Sidebar layout, accent picker, Thai/Lao type pass (§9) — Phase 3.
- The `index.html`/SW cutover (§10 Phase 4) — not until 0–3 are verified.

## Verification done for this phase

- `node --check` on all three new JS files.
- Every `<script src>`/`<link href>` in `v2/index.html` resolves (served
  locally, checked with `curl`, all 200).
- Manual trace-through of `store`/`api`/`i18n` wiring (init → subscribe →
  render order).
- Headless-browser render check was attempted (Playwright) but this
  environment's macOS version (12.6.0) isn't supported by current Playwright
  Chromium builds — not run. Worth doing in a real browser before Phase 1
  builds on top of this.
- `git status`/`git diff` confirm zero changes to any v1 file, and
  `service-worker.js`'s `ASSETS` array (and thus what's cached/served to
  installed PWAs) is untouched.
