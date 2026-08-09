# BuncheeNgern v2 — Phase 1.5: session &amp; authentication

Implements `bcn-v2-phase1-entry-prompt.md`: the entry screen only (type,
item, currency + inline add, payment toggles, amount(s), branch, slip,
confirmation sheet, submit). Nothing here is reachable by real users: v1
(`/index.html` + `css/app.css` + `js/*.js`) is completely unmodified, still
the only thing deployed, and still the only thing referenced by
`service-worker.js`'s `ASSETS`.

## Phase 1, on top of Phase 0

| File | Notes |
|---|---|
| `js/config.js` | Branches/currencies/theme, `bcn2_`-prefixed keys, seeded once from v1's `savedBranches`/`savedCurrencies`/`appTheme`. If no branches exist yet (v1 or v2), seeds two localized default names and persists them immediately — branch names are persisted data, so they must not shift if the UI language changes later. |
| `js/ui.js` | `esc`, amount formatting (`amt`/`formatAmount`, ported from v1 `js/core.js`), `fmtN`/`nowStamp`/`fmtDateTab`, toast, overlay, and the two document-level `data-action`/`data-bind` delegated listeners every screen uses instead of inline `onclick`. |
| `js/entry.js` | The screen: state in `store.entry`, two independent payment toggles (no more three-way Cash/Online/Split choice), the slip rule as a structural `online.on` check, `compressImg` ported unchanged, the wire-format `'Split'` reconstruction Code.gs still requires when both toggles are on. |
| `js/app.js` | Boot: theme, language, mount, one store subscription, one initial render. |
| `css/components.css` | Header, fields, buttons, toggles, branch grid, amount rows, slip zone, confirmation sheet, toast, overlay — ported from v1 `css/app.css`, re-scoped to this screen's markup. |
| `index.html` | All 18 language files now load (Phase 0 loaded 3, so Lao silently fell back to English). `store`/`i18n`/`api` each gained an explicit `window.X = X` export line — `const store` was a lexical binding, not a `window` property. |

Three Phase 0 findings this phase fixed: missing language files, missing
`window.*` exports, and zero `data-i18n` nodes to exercise `applyTranslationsToDom()`.

## Phase 1.5, on top of Phase 1

Implements `bcn-v2-phase1.5-session-auth.md` — the gap Phase 1 shipped with:
`store.get().sessionToken` was never set by anything, so every request sent
`sessionToken: ''` and the backend answered `AUTH_EXPIRED`. Phase 1's own
manual test 8 ("submit a both-on entry") could never have passed.

**Store contract this phase owns** (top-level keys, not a nested object —
`entry.js`'s `buildPayload()` reads `state.staffName`/`state.userEmail`
directly, so those exact names are load-bearing): `screen`
(`'login' | 'locked' | 'entry'`), `sessionToken`, `staffName`, `userEmail`,
`authError`.

| File | Notes |
|---|---|
| `js/session.js` (new) | Device identity, session persistence (`{staffName, userEmail, sessionToken, locked}` — v1's `shop` dropped, branch memory is an entry-state concern), Google Sign-In — ported from v1 `js/session.js`, adapted to `store.js` instead of the `A` global/`$`/`showScr`. `bcn2_device`/`bcn2_session`, **not** seeded from v1's `deviceId`/`userSession`: sharing either would let v1 and v2 collide on one Sessions row, so either app's logout/lock would invalidate the other. `lockSession()` keeps the stored token (a lock is a client-side UX gate, matching v1 — only `forgetDevice()` actually revokes anything) so an unlock reuses it via `apiAuthenticate`'s `existingToken` instead of minting a new session row. **No lock/logout UI this phase** — `lockSession`/`clearSession` are exported unused, for Phase 3's menu to wire up. |
| `js/app.js` | Boot rewritten: theme → language → `restoreSession()` **before** the first render → `mountEntryScreen()` unconditionally (cheap — no fetch, just DOM refs + config.js dropdowns, safe regardless of which screen results) → `initGoogleSignIn()` → one subscriber (`authError` early-return → `onAuthError`; else translate + `routeScreen` + `renderEntry`) → one initial paint. `routeScreen(state)` is a pure `.hidden`-class toggle driven by `state.screen`; `onAuthError(code)` calls `forgetDevice()`, warns on `AUTH_DENIED`, and resets `screen` to `'login'`. |
| `index.html` | Two new screens (`#screen-login`, `#screen-locked`, both starting `hidden`, `#screen-entry` now starts `hidden` too), the GSI platform script in `<head>` (`async defer` — a sanctioned exception for a third-party loader, not a v1-constraint change). Locked screen shows `lockTitle` as a heading, the signed-in name in `#locked-user`, and its own Google button (`#g-signin-btn-locked`) — the same callback re-signs-in-as-the-same-account, which **is** the unlock. |
| `css/components.css` | Login/locked card — ported from v1 `css/app.css`, unchanged values. |

`js/ui.js` is untouched this phase (screen routing lives in `app.js`, not as
a generic helper — nothing else needs it yet).

### Locked-screen copy reuses existing i18n keys only

v1 has no dedicated locked-screen strings (it reuses the login screen
outright). Rather than add new `i18n/lang_*.js` keys — those files are
outside `v2/`, off-limits per this phase's hard constraints — the locked
screen reuses `lockTitle` (heading) and `googleSignInHint` (button hint); the
signed-in name itself is data, not UI copy, so it needs no key.

### Local testing caveat

Google Sign-In validates the page origin against the OAuth client's
authorized origins. `http://localhost:8000` is almost certainly **not**
authorized — sign-in fails there with an origin error even when the code is
correct — confirmed live: a local `localhost:8123` origin got a 403 on the
GSI button iframe. Either add it to the OAuth client's Authorized JavaScript
origins (dev-only, remove later) or test at `https://bcn.felismp.xyz/v2/`,
which already is (see "Live smoke — passed" below).

### Live smoke — passed

Run against the real deployment at `https://bcn.felismp.xyz/v2/` with real
config temporarily in place (reverted to placeholder after): sign in via GSI
→ real `sessionToken`/`staffName`/`userEmail` landed in the store, routed
login → entry; submitted a real entry, `staffName`/`userEmail` correctly
attached (form reset confirmed the write); reloaded mid-session → restored
straight to `entry`, no login flash; corrupted `sessionToken` and submitted
→ `AUTH_EXPIRED` routed cleanly back to `login` with the warn message shown.
All three `screen` states rendered correctly in the browser.

Found and fixed one bug in the process, unrelated to this phase's own code:
v1's `service-worker.js` (scope `/`) was intercepting `/v2/` asset requests
even though `v2/` is never in `ASSETS` — its fetch-through path corrupted
stylesheets specifically (200, correct bytes, but rules never applied), so
every screen rendered unstyled and stacked. Fixed with an early return for
`/v2/` paths in the fetch handler, before the navigate/asset branches;
verified live post-fix. See the `fix(sw)` commit.

### Phase 1 follow-up

Two findings from testing Phase 1 in a real browser: an entry could be
submitted with `entry.branch === ''` (v2 had no default branches, and branch
wasn't in the validation list), and local testing starts from an empty
config because seeding is per-origin. Both are fixed/documented — see
`bcn-v2-phase1-followup-prompt.md`.

### Local testing starts empty

`bcn2_*` config is seeded from v1's localStorage, and localStorage is
per-origin. Served from `localhost:8000` there is no v1 data to seed from, so
v2 starts with default branches and **no currencies** — add one with the inline
"＋" control before the entry form can be completed. On production both apps
share an origin and seeding works normally.

## Deliberately not built yet

- `ui.js`/`dashboard.js`/`settings.js`/`charts.js`, `css/dashboard.css` — Phases 2–3.
- The rich item picker with grouped suggestions — v1's is 374 lines and gets
  its own phase; item name is a plain text input for now.
- Accent presets, Thai/Lao type pass, sidebar layout — Phase 3 (§9).
- The `getRangeData` backend endpoint — Phase 2, needs an Apps Script redeploy.
- The `index.html`/SW cutover — not until every phase is verified.

<details>
<summary>Phase 0 (skeleton) — original notes</summary>

Implements only what `bcn-v2-system-design.md` §10 lists for **Phase 0**
("Skeleton project, tokens, base CSS, store, api, i18n port" — risk: none).

## What's here and why

| File | Status | Notes |
|---|---|---|
| `css/tokens.css` | Ported | v1's exact primitives/scales/semantic values (`css/app.css`'s `:root` + `[data-theme="light"]`), unchanged. §9 says this architecture "worked" — reused, not redesigned. The customisable accent-preset picker in §9 is Phase 3; `--accent` is still one fixed value. |
| `css/base.css` | Ported + gap flagged | Reset, `html`/`body`, `.hidden`/`.screen`. The Thai/Lao line-height/font-stack work §9 calls "new and overdue" is **not done** — the doc gives no concrete values, and this needs real testing against Lao text, not a guess. Flagged inline with a comment; block before Phase 3 ships without it. |
| `js/store.js` | Built | Minimal `get()/set(patch)/subscribe(fn)`, per §7 point 1. No middleware, no derived state — not asked for. |
| `js/api.js` | Ported | `_apiFetch`/`_checkAuthError`/`apiGet`/`apiPost`/`apiAuthenticate`, straight from `js/session.js`. Same timeout (15s), same error strings, same `AUTH_EXPIRED`/`AUTH_DENIED` handling — that behaviour is proven in production and wasn't touched. DOM coupling removed: auth loss clears `store`'s `sessionToken`, doesn't reach into a screen directly. **No XHR / upload progress** — impossible against this backend (CORS preflight, Apps Script doesn't answer `OPTIONS`), see `CLAUDE.md`. |
| `js/i18n.js` | Ported | `t()`/`setLang()`/generic `data-i18n*` DOM application, from `js/core.js`. The 18 language files and `i18n/build.js` are **not duplicated** — `v2/index.html` loads them from the existing top-level `i18n/` directory, per §2 ("carry over unchanged"). Screen-specific re-render calls v1's `applyTranslations()` made directly (`renderBranchSegments`, `refreshDashUI`, ...) are gone; a lang change is just `store.set()` and screens subscribe when they exist. |
| `index.html` | Skeleton | Loads the above, runs a visible sanity check (`store`/`api`/`i18n` wired correctly), nothing else. Nothing reachable by real users. |

## Deliberately not built yet (as of Phase 0)

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
