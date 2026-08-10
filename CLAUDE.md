# BuncheeNgern — Claude Working Notes

Production expense-tracker PWA. Real money, real users.
Correctness beats cleverness. Prefer the smallest change that is safe and works.

## Role split

**Planning model** (the stronger reasoning model): architecture decisions,
debugging hard failures, reviewing diffs, validating risks and edge cases,
writing task documents. Not the main code writer unless the task genuinely
needs deep reasoning.

**Implementing model** (the fast model): implementing changes, editing code,
scoped refactors, repetitive file updates, test fixes, following `.md` task
documents.

The implementing model should follow the task document's prose over its own
counts and expectations. Task documents in this repo have repeatedly contained
correct instructions alongside wrong arithmetic in their verify steps. Report
the discrepancy; never change code to satisfy a check that looks wrong.

## Output style

Concise. No obvious background, no repeated requirements, no essays, no
motivational filler, no restating unchanged code.

Task documents: markdown only, specific, short, testable — exact files, exact
behavior, acceptance criteria.

## Architecture

**Frontend** — build-free, no bundler, no dependencies.
`index.html` (shell + inline config + SW registration), `css/app.css`,
`js/*.js`, `i18n/*.js`.

**Backend** — one Apps Script file, `Code.gs`. Sheets + Drive + Telegram.

**Hosting** — Cloudflare Pages is the real frontend. `gh-pages` is a separate
stubbed demo (no backend, no auth, sample data). Don't sync production
backend/auth changes there unless asked.

**`v2/`** — an in-progress ground-up rewrite. Not user-facing.
- Never add `v2/` paths to `service-worker.js`'s `ASSETS`.
- Work in `v2/` must not modify any v1 file.
- v2 config uses `bcn2_*` localStorage keys so a v2 bug can't corrupt the live
  app's settings.

## Hard invariants

**Never change the Sheets row schema** — `ENTRY_HEADERS`, `SESSION_HEADERS`,
`WHITELIST_HEADERS`, or the column-index constants.

**Dashboard aggregation math** (`buildTotals` and friends) requires explicit
permission *and* proof. It has been extended once, additively: `expCash`/`expQr`
were added as a partition of `exp`, with a fuzz test over thousands of random
ledgers showing `cash`/`qr`/`exp` came out bit-identical to the previous logic.
Anything less than that standard: don't.

**Branch names are persisted data.** Only new-user defaults may be localized.

**Plain `<script src>` only — no `type="module"`, `defer`, or `async`.** The
reason is that v1 wires handlers via inline `onclick`, which needs functions in
global scope; module scope breaks every one, and `defer`/`async` change
execution order. v2 removes inline handlers, so this constraint applies to v1
only and can be revisited there.

**Config stays inline in `index.html`** (`GOOGLE_CLIENT_ID`, `SCRIPT_URL`) —
the setup docs tell users to edit it there.

**`js/*.js` are sequential slices of one original file.** Order matters —
notably, language settings must initialize before the branch block. Adding code
is fine; reordering top-level statements is not.

**CSS custom properties may be referenced from JS by name assembly**
(e.g. `` `var(--${cond ? 'amber' : 'accent'})` ``). Grepping for the full token
name will not find these. Read `js/` before renaming or deleting any token.

## Credentials — the repo is public

`main` carries placeholders (`YOUR_GOOGLE_CLIENT_ID_HERE`,
`YOUR_APPS_SCRIPT_URL_HERE`); the working copy holds the real values and stays
permanently dirty by design.

- Never stage or commit `index.html` with a real `script.google.com/macros/s/`
  URL. Once in a public repo's history, removing it needs a history rewrite.
- A stray `git checkout -- index.html` / `stash` / `restore` silently reverts
  the config to placeholders. Deploying that ships an app where every API call
  rejects and sign-in can't initialize. `./scripts/deploy.sh` guards against it.
- `GOOGLE_CLIENT_ID` is public by design and harmless. `SCRIPT_URL` is not
  secret from users but should stay out of a public repo: the Apps Script quota
  is shared with the shop's real usage, and the backend collapses under about
  fifteen rapid requests.

## Service worker rules

`js/`, `css/` and `i18n/` are served **cache-first with no runtime refresh**.
A bad or stale cached response never self-heals — it persists until the cache
name changes. An HTML fallback page once got cached under a `.js` URL and
bricked installed PWAs.

Any commit touching those directories must:
- bump `CACHE` in `service-worker.js`
- add any new file to `ASSETS`

Comment-only changes don't need a bump — no cached asset changed.

Install validates each asset's content-type against its path and aborts rather
than caching a mismatch; asset reads ignore a cached response whose type
contradicts its path, so existing clients self-heal. Don't remove either check.

## Known impossibilities

**Upload progress cannot work talking to Apps Script directly.** Attaching
any listener to `xhr.upload` makes the request non-simple, forcing a CORS
preflight `OPTIONS` that Apps Script does not answer; the request fails
outright. `fetch` works precisely because it cannot report upload progress.
Verified in production.

Since B0 (`bcn-backend-b0-worker-cache.md`), requests go through a Cloudflare
Worker in front of Apps Script that DOES answer `OPTIONS` correctly (verified
live) — the precondition this note used to require ("a proxy in front of
Apps Script that answers OPTIONS") now exists. Upload progress itself is
still NOT implemented — no client code was changed to use XHR/upload
listeners, this only removes the blocker. Don't assume it works without
building and testing it; do assume it's worth trying now.

## Verification

Static checks — parse, grep, diff — confirm code matches the spec. They cannot
confirm the spec was right. Upload progress passed every static check and broke
production.

**Anything that touches the transport layer or talks to the backend needs a
live smoke test before the commit, not after.** A single request against the
real endpoint using an action that hits `doPost`'s `default:` branch writes
nothing and takes seconds.

Prefer tests that execute the real code over tests that inspect it: the fuzz
test over the real `buildTotals`, the stubbed service-worker harness, and the
in-browser contrast measurements each caught things no grep could.

Don't put expected counts in verify steps (`grep -c` → 7). Assert properties
instead: must be empty, must be non-empty, must be identical to X.

## Deployment — three independent steps

- `git push` only updates the GitHub repo. **It does not ship production.**
- Frontend ships via `./scripts/deploy.sh` (wraps `wrangler pages deploy`;
  refuses placeholder config, refuses a committed real `SCRIPT_URL`, runs a
  secret scan). Pages here is direct-upload, **not** git-connected.
- `Code.gs` ships from the Apps Script editor: Deploy ▸ Manage deployments ▸
  edit ▸ **New version** ▸ Deploy. Saving the editor is not deploying.

Committing is not shipping. Pushing is not shipping either.

After a frontend deploy, the browser needs **two loads** to pick up new assets:
the first installs the new service worker, the second serves from it.

## Workflow

One commit per feature. Conventional-commit messages. Secret-scan before every
push. Audit changed files in a sandbox before pushing. Classify findings as
🔴 bug or 🟡 advisory.

## Handoff format

```
# Goal
One sentence.

# Constraints
- only the facts that matter
- hard invariants in play
- files that may be touched

# Changes
- file: exact change

# Tests
- exact commands, expected outcome
- a live smoke test if the transport or backend is involved

# Risks
- only meaningful risks

# Stop conditions
```

## Stop conditions

Stop and ask before:
- changing the Sheets schema
- changing dashboard aggregation math
- touching deployment behavior
- broad refactors outside the requested scope
- committing anything that could contain real credentials

## Debugging rule

1. Identify the smallest failing surface.
2. Inspect the minimum set of files.
3. Make the smallest safe fix.
4. Re-run the relevant test.
5. Summarize the result and the next action only.

When a symptom points at recently-changed code, still check the layer beneath
it. Cache poisoning looked like a deploy failure; the split's payment reporting
looked broken from the client until the server write path showed it wasn't.
