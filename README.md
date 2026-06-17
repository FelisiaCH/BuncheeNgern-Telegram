# Buncheengern

Buncheengern is a zero-dependency, single-file PWA for tracking income and expenses across multiple branches and currencies. Staff sign in with Google, record a transaction (optionally split across multiple currencies, or split between Cash and Online Payment in one go), and the entry is appended to a Google Sheet — slip images go to Drive, and a Telegram message is sent to your management chat(s). Access is controlled by a real, server-verified Google sign-in, not just a client-side check. The frontend is a single `index.html`; the backend is one Google Apps Script file (`Code.gs`).

## Features

- Multi-branch tracking, with branches manageable from the in-app Settings tab
- Multi-currency per transaction — add several currency/amount lines to a single entry (e.g. pay partly in LAK, partly in THB); all lines share one Transaction ID
- User-configurable currencies — a searchable, region-grouped picker (~85 world currencies plus popular crypto): search by code, name, or country and tap to add; only the code and symbol are stored, the list starts empty
- Split payment per line — each currency line can be Cash, Online Payment, or Split (partly Cash + partly Online); a Split line writes two sheet rows sharing the same Transaction ID so the dashboard counts Cash Income and Online Payment Income correctly
- Real Google sign-in authentication — every request is verified server-side against a Google Sheet allow-list (allow/deny per email); unknown emails are auto-logged for review
- Telegram notifications to a private chat, a group, or both at once
- 18 languages with a searchable language picker and automatic device-language detection on first launch (falls back to English)
- Installable PWA with offline app-shell support

## Security

Sign-in is enforced server-side, not just in the browser: every API call carries the user's Google `id_token`, which the backend verifies directly with Google and checks against a Google Sheet allow-list before any data is read or written. The verified email and name — not whatever the client claims — become the recorded author, so entries can't be misattributed. Slip uploads and free-text input are also re-validated server-side, independent of what the browser already enforced.

See [docs/SETUP.md#security](docs/SETUP.md#security) for the full breakdown.

## Architecture

| Layer | Technology |
| --- | --- |
| Frontend | Single-file HTML/CSS/JS PWA, 18-language i18n (`i18n/lang_*.js`), installable via `service-worker.js` |
| Backend | Google Apps Script (`doGet`/`doPost` Web App), scopes declared in `appsscript.json` |
| Auth | Google `id_token` verified server-side via Google's `tokeninfo` endpoint + a Google Sheet allow-list (`AllowedUsers` tab) — see [Security](docs/SETUP.md#security) |
| Storage | Google Sheets (one tab per day) + Google Drive (slip images) |
| Notifications | Telegram Bot API, sent server-side to one or more chats, HTML-escaped |

## Documentation

- **[Setup & deployment guide](docs/SETUP.md)** — full walkthrough: Google Sheets/Apps Script backend, Telegram bot, OAuth client, hosting, and the security model
- **[Usage guide](docs/USAGE.md)** — day-to-day guide for staff: logging entries, multi-currency/split payments, the dashboard, switching language, installing as a PWA

**Quick start:** see [docs/SETUP.md](docs/SETUP.md) to deploy your own instance.

© 2026 FelisiaCH — MIT License
