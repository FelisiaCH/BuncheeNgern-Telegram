# FinTrack

A mobile-first PWA for logging income & expenses across one or more branches. Staff sign in with Google, record a transaction (optionally split across multiple currencies in one go), and the entry is appended to a Google Sheet — slip images go to Drive, and a Telegram message is sent to your management chat(s). The frontend is a single `index.html`; the backend is one Google Apps Script file (`Code.gs`).

## Features

- Multi-branch tracking, with branches manageable from the in-app Settings tab
- Multi-currency per transaction — add several currency/amount lines to a single entry (e.g. pay partly in LAK, partly in THB); all lines share one Transaction ID
- Telegram notifications to a private chat, a group, or both at once
- 5 languages: Lao, Thai, English, Vietnamese, Burmese
- Installable PWA with offline app-shell support

> **Heads-up on security:** Sign-in here is a *soft gate*, not real access control. The Google credential (JWT) is decoded in the browser but never verified server-side, and the Apps Script backend is deployed with "Who has access: Anyone" (required so the Web App doesn't redirect to a login page). The sign-in screen exists to record "who logged this" on each entry for a trusted internal team — anyone who has the Web App URL can call it directly. Don't use this as access control for sensitive data. See [Hardening](#hardening-optional) if you need more.

---

## Prerequisites

- A Google account (for the Sheet, Drive folder, Apps Script project, and OAuth client)
- A Telegram bot token (from @BotFather) and at least one chat ID to notify
- Somewhere to host the whole project folder over **HTTPS** (e.g. Cloudflare Pages, Netlify, GitHub Pages). Google Sign-In does **not** work from `file://` or a plain `http://` origin.

There are **six** placeholder values to fill in before the app works:

| File | Constant | What it is |
| --- | --- | --- |
| `Code.gs` | `SPREADSHEET_ID` | ID of your Google Sheet (from its URL) |
| `Code.gs` | `DRIVE_FOLDER_ID` | ID of the Drive folder where slip images are stored |
| `Code.gs` | `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `Code.gs` | `TELEGRAM_CHAT_IDS` | **Array** of chat IDs to notify — one or more, private and/or group |
| `index.html` | `GOOGLE_CLIENT_ID` | OAuth Web client ID (for Google Sign-In) |
| `index.html` | `SCRIPT_URL` | Your deployed Apps Script Web App `/exec` URL |

---

## 1. Backend — Google Sheets + Apps Script

1. Create (or open) a Google Sheet. Copy its ID from the URL: `docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`.
2. Create a Drive folder for slip images and copy its ID from the URL.
3. In the Sheet, go to **Extensions ▸ Apps Script**. Delete the default code and paste in all of `Code.gs`.
4. Create `appsscript.json` in the same project (in **Project Settings**, enable "Show `appsscript.json` manifest file" first) and paste in the contents of this repo's `appsscript.json`. It declares the scopes the script needs:
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/script.external_request` (needed for the Telegram API call)
5. Fill in the constants at the top of `Code.gs`:

   ```js
   const SPREADSHEET_ID  = 'YOUR_GOOGLE_SHEET_ID_HERE';
   const DRIVE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID_HERE';
   const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
   const TELEGRAM_CHAT_IDS  = ['YOUR_TELEGRAM_CHAT_ID_HERE'];
   ```

6. **Authorize the script.** In the editor toolbar, pick any function (e.g. `todayTab`) from the function dropdown and click **Run** once. Google will show a consent screen — approve it. This single consent covers *all* the scopes declared in `appsscript.json`, including the external-request permission needed to call Telegram and the Drive permission needed to upload slips. **If you skip this, entries still save to the sheet, but Telegram messages and slip uploads will silently fail.**
7. Click **Deploy ▸ New deployment ▸ Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone
8. Copy the **Web app URL** (ends in `/exec`). You'll paste it into `index.html` as `SCRIPT_URL`.

> **Every time you edit `Code.gs` (or `appsscript.json`), you must ship a new deployment version** — go to **Deploy ▸ Manage deployments ▸ edit (pencil) ▸ Version: New version ▸ Deploy**. Editing the script alone does *not* update the live `/exec` URL's behavior.

### What the backend exposes

- `doGet`: `?action=getTodayData` (today's entries) and `?action=getDateData&date=DD-MM-YYYY` (entries for a specific day's sheet tab)
- `doPost`: `{ action: 'submitEntry', ... }` — uploads the slip (if any) to Drive, appends one row per currency amount to the day's sheet tab (all sharing one `Transaction ID`), and sends the Telegram notification
- Each day's sheet tab is created on first use with header row: `Timestamp, Staff Name, Item Name, Currency, Price, Type, Shop, Payment Method, Slip URL, Transaction ID`

---

## 2. Telegram bot

1. In Telegram, message **@BotFather**, send `/newbot`, follow the prompts, and copy the **bot token** — that's `TELEGRAM_BOT_TOKEN`.
2. Get the chat ID(s) you want to notify:
   - **Private chat (you or a staff member):** the bot can't message you first, so send it any message, then open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and read `message.chat.id` — it's a plain positive number.
   - **Group chat:** add the bot to the group, send any message in the group, then check `getUpdates` for that update's `chat.id` — group IDs are negative and often start with `-100`.
3. Put one or more IDs into the array, as strings or numbers:

   ```js
   const TELEGRAM_CHAT_IDS = ['123456789', '-1009876543210'];
   ```

   Every non-placeholder entry in the array gets a copy of the notification. Leave it as `['YOUR_TELEGRAM_CHAT_ID_HERE']` (or remove unused entries) if you only want one destination.

> "Chat not found" almost always means you never sent the bot a message first (for a private chat), or the bot isn't a member of the group, or the ID is wrong/missing its leading `-`.

---

## 3. Google Sign-In — OAuth client

This is required for the sign-in button to appear at all.

1. Go to **console.cloud.google.com ▸ APIs & Services ▸ Credentials**.
2. **Create Credentials ▸ OAuth client ID ▸ Application type: Web application**.
3. Under **Authorized JavaScript origins**, add the exact origin where you'll host the app — e.g. `https://yourproject.pages.dev` (scheme + host **only**, no path, no trailing slash, and it must be `https://`, never `file://`). Add every origin you'll actually open the app from, including any dev/preview URL.
4. Copy the **Client ID** — that's `GOOGLE_CLIENT_ID`.

> If the sign-in button shows but clicking it does nothing, open the browser console — `origin is not allowed for the given client ID` means the origin in step 3 doesn't exactly match the URL the page is served from (including the scheme).

If `GOOGLE_CLIENT_ID` is still left as the placeholder, or the Google Identity Services script fails to load, the login screen shows an inline hint explaining what's wrong instead of leaving an empty space.

---

## 4. Frontend config + hosting

1. Near the top of the `<script>` block in `index.html`, set the two constants:

   ```js
   const GOOGLE_CLIENT_ID = "…your OAuth client ID…";
   const SCRIPT_URL       = "…your Apps Script /exec URL…";
   ```

   These are plain constants in the file — there is no in-app settings field for them.
2. Deploy the **whole project folder**, not just `index.html` — the app loads `i18n/lang_*.js`, `service-worker.js`, and icon/manifest files from relative paths, and will fail to load or run untranslated if those 404. From the repo root:

   ```bash
   npx wrangler pages deploy .
   ```

   (or the equivalent "deploy this folder" flow on Netlify/GitHub Pages). Deploying only `index.html` is a common mistake and breaks the app.
3. Open the page on that HTTPS URL.
4. **Bump the service worker cache on every change.** `service-worker.js` defines:

   ```js
   const CACHE = 'fintrack-v1.1.4';
   ```

   HTML pages are fetched network-first (so most changes to `index.html` reach users on their next reload automatically), but `i18n/lang_*.js`, icons, and other static assets are served cache-first. Whenever you change any static asset, bump the `CACHE` string (e.g. `v1.1.5`) so old cached files are evicted and the new ones are fetched.

---

## 5. First run — add currencies

**Currencies are not preset.** The list starts empty. Before you can log any entry, go to **Settings ▸ Manage Currencies** and add at least one currency with a code and symbol (e.g. code `LAK`, symbol `₭`). The app will warn you and block submission if no currencies are configured.

See [docs/USAGE.md](docs/USAGE.md) for the full day-to-day usage guide (logging entries, multi-currency transactions, dashboard, PWA install, etc.).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No "Sign in with Google" button, or an inline "not configured" hint | `GOOGLE_CLIENT_ID` is still the placeholder | Set it (§3–4) |
| Button appears but clicking does nothing, or console shows `origin is not allowed for the given client ID` | The page's origin isn't in the OAuth client's Authorized JavaScript origins, or the page is on `file://`/`http://` | Add the exact `https://` origin in the OAuth client (§3); host over HTTPS |
| Entry saves but no Telegram message arrives | Script never authorized for external requests, bot token wrong, or chat ID(s) wrong/never messaged the bot | Run any function once in the Apps Script editor to authorize (§1.6); verify token and chat IDs (§2). The response includes `telegramOk`/`telegramError` so the app can show the exact failure as a toast |
| Telegram error mentions "chat not found" | The bot was never messaged first (private chat), or isn't in the group, or the ID is missing its `-` prefix | Re-check §2 |
| Slip upload fails | Script not authorized, or wrong `DRIVE_FOLDER_ID` | Authorize (§1.6); check the folder ID |
| `i18n/lang_*.js` 404s, app stuck on splash, or UI shows untranslated keys | Only `index.html` was deployed, not the whole folder | Redeploy the entire project folder (§4.2) |
| Code/UI changes don't show up on a phone that already installed the app | Stale service-worker cache for static assets | Bump `CACHE` in `service-worker.js` (§4.4) and reload; HTML itself is network-first so most changes should appear on a normal reload |
| Apps Script changes don't take effect | Edited `Code.gs` but didn't ship a new deployment version | Deploy ▸ Manage deployments ▸ edit ▸ New version ▸ Deploy (§1) |

> **Telegram + special characters:** notifications are sent with HTML formatting and every interpolated field (item name, branch, author, etc.) is HTML-escaped, so names containing `_`, `*`, `` ` ``, or `[` are safe and won't break the message.

---

## Hardening (optional)

If you need sign-in to be real access control rather than a soft gate:

- Send the Google credential (JWT) to the backend on every write and verify it server-side — check the signature, that `aud` matches your `GOOGLE_CLIENT_ID`, and that the email is on an allow-list — before appending the row.
- Keep "Who has access: Anyone" (Apps Script needs this to avoid login redirects), but have `doPost` reject any request whose token is missing or fails verification.

---

## Architecture

| Layer | Technology |
| --- | --- |
| Frontend | Single-file HTML/CSS/JS PWA, 5-language i18n (`i18n/lang_*.js`), installable via `service-worker.js` |
| Backend | Google Apps Script (`doGet`/`doPost` Web App), scopes declared in `appsscript.json` |
| Storage | Google Sheets (one tab per day) + Google Drive (slip images) |
| Notifications | Telegram Bot API, sent server-side to one or more chats, HTML-escaped |

© 2026 FelisiaCH — MIT License
