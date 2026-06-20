# Buncheengern — Setup & Deployment Guide

Full walkthrough for forking and deploying your own instance: the Google Sheets + Apps Script backend, the Telegram bot, the OAuth client, frontend hosting, and the security model. For the project overview, see the [README](../README.md). For the day-to-day usage guide, see [docs/USAGE.md](USAGE.md).

---

## Prerequisites

- A Google account (for the Sheet, Drive folder, Apps Script project, and OAuth client)
- A Telegram bot token (from @BotFather) and at least one chat ID to notify
- Somewhere to host the whole project folder over **HTTPS** (e.g. Cloudflare Pages, Netlify, GitHub Pages). Google Sign-In does **not** work from `file://` or a plain `http://` origin.

There are **seven** placeholder values to fill in before the app works:

| File | Constant | What it is |
| --- | --- | --- |
| `Code.gs` | `SPREADSHEET_ID` | ID of your Google Sheet (from its URL) |
| `Code.gs` | `DRIVE_FOLDER_ID` | ID of the Drive folder where slip images are stored |
| `Code.gs` | `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `Code.gs` | `TELEGRAM_CHAT_IDS` | **Array** of chat IDs to notify — one or more, private and/or group |
| `Code.gs` | `GOOGLE_CLIENT_ID` | OAuth Web client ID — **must be the exact same value** as `index.html`'s `GOOGLE_CLIENT_ID` below; the backend uses it to verify each request's token |
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
   const GOOGLE_CLIENT_ID   = 'YOUR_GOOGLE_CLIENT_ID_HERE';
   ```

   `GOOGLE_CLIENT_ID` here must be the **same OAuth client ID** you'll set in `index.html` (§4) — the backend uses it to verify that incoming tokens were actually issued for this app.

6. **Authorize the script.** In the editor toolbar, pick any function (e.g. `todayTab`) from the function dropdown and click **Run** once. Google will show a consent screen — approve it. This single consent covers *all* the scopes declared in `appsscript.json`, including the external-request permission needed to call Telegram and the Drive permission needed to upload slips. **If you skip this, entries still save to the sheet, but Telegram messages and slip uploads will silently fail.**
7. Click **Deploy ▸ New deployment ▸ Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone
8. Copy the **Web app URL** (ends in `/exec`). You'll paste it into `index.html` as `SCRIPT_URL`.

> **Every time you edit `Code.gs` (or `appsscript.json`), you must ship a new deployment version** — go to **Deploy ▸ Manage deployments ▸ edit (pencil) ▸ Version: New version ▸ Deploy**. Editing the script alone does *not* update the live `/exec` URL's behavior.

> **"Who has access: Anyone" no longer means anyone can use the app.** This setting only controls whether Apps Script redirects unauthenticated requests to a Google login page (it must stay "Anyone" so the Web App responds directly). Actual access control happens inside the script itself — every request is verified against Google and checked against the `AllowedUsers` sheet tab (see below) before any data is read or written.

### What the backend exposes

- `doGet`: `?action=getTodayData` (today's entries) and `?action=getDateData&date=DD-MM-YYYY` (entries for a specific day's sheet tab). Each call carries the app **session token** (`?sessionToken=…`).
- `doPost` accepts two actions:
  - `{ action: 'authenticate', idToken, deviceId, deviceLabel, userAgent, ... }` — the **one-time sign-in step**: verifies the Google `id_token`, checks the allow-list, then mints (or, for a known device, reuses) a **session token** for that device and returns it (see [The `Sessions` tab](#the-sessions-tab)).
  - `{ action: 'submitEntry', sessionToken, ... }` — uploads the slip (if any) to Drive, appends rows to the day's sheet tab (Cash and Online Payment lines write one row each; a Split line writes **two rows** — one `Cash` and one `Online Payment` — all sharing one `Transaction ID`), and sends the Telegram notification
- Each day's sheet tab is created on first use with header row: `Timestamp, Staff Name, Item Name, Currency, Price, Type, Shop, Payment Method, Slip URL, Transaction ID`
- **The `doGet` reads and `submitEntry` both require a valid, non-expired session token** whose email is still allow-listed — see [Security](#security). Only `authenticate` accepts the Google `id_token`; every other request uses the session token instead.

### The `AllowedUsers` allow-list tab

Every request — reads and writes alike — is checked against a sheet tab named **`AllowedUsers`**. You don't need to create it manually: the backend creates it automatically (with the header row below) the first time anyone tries to use the app.

| Email | Status | Note | Last Login |
| --- | --- | --- | --- |
| `someone@example.com` | allow | | 17-06-2026 14:32:01 |

- **`Status` = `allow`** (case-insensitive) — the request proceeds, and `Last Login` is updated to the current timestamp.
- **`Status` = `deny`**, or any other value — the request is rejected.
- **Email not in the sheet at all** — a new row is auto-appended with `Status = deny` and `Note = "Auto-logged on first access attempt"`, and the request is rejected.

This means **the very first sign-in for every email — including your own, as the project owner — is automatically logged as `deny`.** After your first attempt, open the `AllowedUsers` tab and change your row's `Status` to `allow`. Repeat for every staff member's email the first time they try to sign in, or pre-populate the tab with known emails set to `allow` before rollout so nobody hits the denied screen.

### The `Sessions` tab

After a successful Google sign-in the backend mints its own **session token** and stores it in a sheet tab named **`Sessions`** — also **auto-created** on first use, never created or edited by hand. From then on the app sends this session token (not the Google token) with every request.

| Token | Email | Name | DeviceId | DeviceLabel | UserAgent | Created | Expires |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `a1b2…` | `someone@example.com` | Jane | `f3c2-…` | Chrome on Android (RMX3301) | Mozilla/5.0 … | 17-06-2026 14:32:01 | 17-07-2026 14:32:01 |

- **30-day rolling expiry:** every valid request pushes `Expires` 30 days into the future, so an active user effectively stays signed in; only ~30 days of true inactivity ends a session.
- **Device-bound:** each device stores a random `DeviceId`. Signing in again on the **same device reuses that device's row** (no duplicate rows); a **different device** for the same email gets **its own row**. `DeviceLabel` is a best-effort parse (browser + OS + model when detectable, e.g. "Chrome on Android (RMX3301)") and `UserAgent` is the full string — both are for your visibility only.
- **You never edit this tab by hand**, but you **can delete rows to force a sign-out:** delete one device's row to sign that device out, or delete all of a user's rows to sign them out everywhere. The next request from a deleted session is rejected and the user signs in with Google again.
- Expired rows are pruned automatically whenever a new session is created.

> **Upgrading an existing instance?** The `Sessions` tab schema grew from 5 columns to the 8 above. If you deployed an earlier version that created a 5-column `Sessions` tab, **delete that tab** so it's recreated with the new 8-column header (old session rows are discarded; everyone simply signs in once more). Also remember to **ship a new Apps Script deployment version** after any `Code.gs` change (see the note in §1), and note that on first run with the new backend every user signs in with Google once to mint their first session token.

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
4. Copy the **Client ID** — that's `GOOGLE_CLIENT_ID`. Use this **same value** in both `index.html` (§4) and `Code.gs` (§1) — the backend checks every token's `aud` claim against its own copy, so a mismatch between the two will make every sign-in fail with "session expired."

> If the sign-in button shows but clicking it does nothing, open the browser console — `origin is not allowed for the given client ID` means the origin in step 3 doesn't exactly match the URL the page is served from (including the scheme).

If `GOOGLE_CLIENT_ID` is still left as the placeholder, or the Google Identity Services script fails to load, the login screen shows an inline hint explaining what's wrong instead of leaving an empty space. Signing in successfully is only half the story now — the backend still has to verify the token and find the email allow-listed in `AllowedUsers` (§1) before any data loads or saves.

Note that Google sign-in now happens **once**: it mints an app session token that keeps the user signed in on that device for ~30 days of rolling activity (see [The `Sessions` tab](#the-sessions-tab)). After that, the Google button appears again only to **unlock** a locked session or after ~30 days of inactivity — the Google `id_token` itself is no longer sent on every request.

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
   const CACHE = 'buncheengern-v1.1.15';
   ```

   HTML pages are fetched network-first (so most changes to `index.html` reach users on their next reload automatically), but `i18n/lang_*.js`, icons, and other static assets are served cache-first. Whenever you change any static asset, bump the `CACHE` string (e.g. `v1.1.15`) so old cached files are evicted and the new ones are fetched.

---

## 5. First run — add currencies

**Currencies are not preset.** The list starts empty. Before you can log any entry, go to **Settings ▸ Manage Currencies**, search the built-in picker (~85 world currencies plus popular crypto — search by code, name, or country, e.g. "LAK" or "Laos") and tap to add at least one. The app will warn you and block submission if no currencies are configured.

See [docs/USAGE.md](USAGE.md) for the full day-to-day usage guide (logging entries, multi-currency transactions, dashboard, PWA install, etc.).

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

## Security

Every API call — both reading the dashboard and saving an entry — is gated server-side before any other code runs:

- **One-time Google verification:** the Google `id_token` is sent **only** to the `authenticate` action. The backend calls Google's `tokeninfo` endpoint directly, and rejects the sign-in unless the call returns 200, the token's `aud` matches the backend's own `GOOGLE_CLIENT_ID`, and the email is marked verified by Google.
- **App-minted session tokens:** on a successful `authenticate`, the backend generates its own random session token, stores it in the `Sessions` tab (see §1) with a 30-day rolling expiry, and returns it. **Every other request** — all `doGet` reads and `submitEntry` — carries this **session token** (query param on `doGet`, JSON body on `doPost`), which the backend validates against the `Sessions` tab (the row must exist and not be expired). The short-lived Google token is never sent again.
- **Allow-list re-checked every call:** the email — from the verified Google token at `authenticate`, and from the session row on every request afterward — is checked against the `AllowedUsers` sheet tab (see §1) on **every** request. Only `Status = allow` proceeds; `deny` or an unknown email is rejected (unknown emails are auto-logged as `deny` for the owner to review). Flipping a user to `deny` therefore revokes access immediately, even mid-session.
- **Device-bound, with an ownership check on reuse:** each session is tied to the device that created it (`DeviceId`). When a stored session is **unlocked** (the user signs in with Google again while the token is still saved on the device), the backend reuses that stored token **only if the Google-verified email matches the email on the token's row** — so a session token stolen from one account can't be unlocked or reused under a different Google identity.
- **Verified identity, not client-supplied:** the recorded author fields (`staffName`, `userEmail`) come from the verified session row (or the Google token at sign-in), never from client input — a client can't spoof who an entry is attributed to.
- **Slip uploads:** the server independently re-validates every uploaded slip — rejects any MIME type outside `image/jpeg`, `image/png`, `image/webp`, `image/gif`, and rejects anything over 5 MB — regardless of what the browser already enforced.
- **Slip links:** the dashboard only renders a slip link if its URL starts with `https://`; anything else (e.g. a `javascript:` URL from a manually edited sheet cell) is silently dropped.
- **Input clamping:** free-text fields (`itemName`, `staffName`, `shop`) are truncated to 200 characters and the entry `type`/currency code are coerced to expected shapes before being written, so a direct API call can't write arbitrarily large or malformed rows.
- **"Who has access: Anyone"** is still required at the Apps Script deployment level (otherwise unauthenticated requests get redirected to a Google login page instead of reaching your code), but it no longer means anyone can actually use the app — see §1.
