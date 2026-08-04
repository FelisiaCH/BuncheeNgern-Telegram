# BuncheeNgern — working notes for Claude

Production expense-tracker PWA. Real money, real users: correctness beats
cleverness. Prefer the smallest change that works.

## Architecture
- Frontend: build-free, no bundler, no dependencies. `index.html` (shell +
  inline config + SW registration) + `css/app.css` + `js/*.js` + `i18n/*.js`.
- Backend: one Apps Script file, `Code.gs` — Google Sheets + Drive + Telegram.
- Hosting: Cloudflare Pages (frontend). `gh-pages` is a **separate stubbed demo
  build** — backend/auth removed, sample data only. Don't sync changes there
  unless asked.

## Invariants (do not violate without being told to)
- **Never change the Sheets row schema** (`ENTRY_HEADERS`, `SESSION_HEADERS`,
  `WHITELIST_HEADERS`) or the column-index constants.
- **Never touch the dashboard aggregation math** (`buildTotals` and friends).
- **Branch names are persisted data.** Only new-user defaults may be localized.
- **Plain `<script src>` only — no `type="module"`, no `defer`/`async`.** The UI
  wires handlers via inline `onclick=`, which needs functions in global scope.
- **Config stays inline in `index.html`** (`GOOGLE_CLIENT_ID`, `SCRIPT_URL`) —
  the setup docs tell users to edit it there.
- `js/*.js` files are **sequential slices** of the original single file and are
  order-sensitive. Adding code is fine; reordering top-level statements is not.

## Service worker rule
`js/`, `css/`, and `i18n/` are served **cache-first with no runtime refresh**.
- Any commit touching those dirs **must bump `CACHE`** in `service-worker.js`.
- Any **new** file there must also be added to the `ASSETS` array.
Miss either and installed PWAs keep running old code / break offline.

## Deployment — three independent steps
- `git push` ships **nothing to users**. It only updates the GitHub repo.
- Frontend goes live via `./scripts/deploy.sh` (wraps `wrangler pages deploy`
  with guards: refuses placeholder config, refuses a committed real
  `SCRIPT_URL`, runs the secret scan). This Pages project is direct-upload,
  **not** git-connected.
- `Code.gs` needs Apps Script ▸ Deploy ▸ Manage deployments ▸ edit ▸
  **New version** ▸ Deploy. Saving the editor is not deploying.

Committing is not shipping. Pushing is not shipping either.

## Workflow
- One commit per feature; conventional-commit messages.
- Secret-scan before every push.
- Changed files get audited in a sandbox before pushing; findings are classified
  🔴 bug / 🟡 advisory.
