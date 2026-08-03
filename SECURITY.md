# Security Policy

## Overview & scope

Buncheengern is a **self-hosted**, zero-dependency, build-free PWA (`index.html` + `css/app.css` + `js/*.js`) with a Google Apps Script + Google Sheets/Drive backend (`Code.gs`). There is no central service: every deployment is set up and operated by whoever forks it, using their own Google account, OAuth client, Sheet, Drive folder, and Telegram bot.

Because of that, the security of any given instance depends partly on **correct setup and operation** — keeping real configuration values out of the public repository, deploying the Apps Script as documented, and curating the access allow-list. The setup and the security model are described in **[docs/SETUP.md](docs/SETUP.md)** (see its [Security](docs/SETUP.md#security) section and §1 for the `AllowedUsers` and `Sessions` tabs). This document summarizes the security model, the honest threat model, and how to report issues.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**:

- Preferred: use GitHub's **“Report a vulnerability”** button under this repository's **Security** tab (GitHub private security advisories). This keeps the report and any exploit detail private until a fix is available.
- Please **do not** open a public issue or pull request that contains exploit details or reproduction steps for an unfixed vulnerability.

This is a small, best-effort project maintained in spare time — there is **no formal SLA**. Reports are reviewed and acknowledged as soon as is practical, and genuine issues will be addressed on a best-effort basis. When you report, a minimal description, the affected file/area, and the impact are the most useful things to include.

## Authentication & sessions

Authentication and access control run **server-side** in the Apps Script backend, not just in the browser:

- **One-time Google verification.** Sign-in uses Google Identity Services. The Google `id_token` is sent only to the backend's `authenticate` action, which verifies it against Google's `tokeninfo` endpoint and rejects it unless the call returns 200, the token's `aud` equals the deployment's own `GOOGLE_CLIENT_ID`, and the email is marked verified by Google.
- **App-minted session tokens.** On success the backend generates its **own** random session token, stores it in the `Sessions` sheet tab with a **30-day rolling expiry**, and returns it. Every subsequent request carries this **session token** (not the Google token) — as a query parameter on `doGet` reads and in the JSON body on `doPost` — and the backend validates it against the `Sessions` tab (the row must exist and not be expired). Each valid request rolls the expiry forward 30 days, so only ~30 days of true inactivity ends a session.
- **Allow-list re-checked every request.** The email — from the verified Google token at sign-in, and from the session row afterward — is checked against the `AllowedUsers` tab on **every** request. Flipping a user to `deny` therefore revokes access immediately, even mid-session.
- **Device-bound sessions with an ownership check.** Each session is tied to the device that created it (a random `DeviceId`). When a stored session is **unlocked** (the user signs in with Google again while the token is still saved locally), the backend reuses that stored token **only if the Google-verified email matches the email on the token's row** — so a session token stolen from one account cannot be unlocked or reused under a different Google identity.
- **Server-derived identity.** The recorded author fields (`staffName`, `userEmail`) always come from the verified session row (or the Google token at sign-in), never from client-supplied input, so entries cannot be misattributed.

## Input & content protections

- **Slip uploads** are re-validated server-side regardless of what the browser enforced: the MIME type must be one of `image/jpeg`, `image/png`, `image/webp`, `image/gif`, and the decoded file must be **≤ 5 MB**; anything else is rejected.
- **Slip links** are only rendered when the stored URL begins with `https://` (`safeUrl`); any other scheme (e.g. a `javascript:` URL pasted into a sheet cell) is silently dropped.
- **Free-text fields** are clamped before being written: `itemName`, `staffName`, and `shop` are truncated to 200 characters, the currency code to 10, and `type` is coerced to `Income`/`Expense` — so a direct API call can't write arbitrarily large or malformed rows.
- **Telegram notifications** are sent with every interpolated field HTML-escaped, so user text can't break or inject into the message.

## Known limitations & threat model

These are deliberate trade-offs of the architecture. They are stated plainly so operators aren't misled about what the app does and doesn't protect against.

- **The session token is a bearer token.** It is stored in the browser's `localStorage` and sent as a **query parameter** on GET reads — Apps Script Web Apps cannot read custom request headers, so a header-based scheme isn't available. Anyone who can read the token (device compromise, malware, shoulder-surfing a URL) can act as that user until the session is deleted or expires. Mitigations: the app is served over **HTTPS only**; session rows are **deletable** (an operator can delete a row to sign one device out, or all of a user's rows to “sign out everywhere”); and tokens carry a **30-day rolling expiry**. There is no server-side per-request anomaly detection.
- **The Apps Script Web App must be deployed as “Anyone”.** This is required only so the Web App responds directly instead of redirecting unauthenticated callers to a Google login page. It does **not** mean anyone can use the app — protection comes from the in-app session-token and allow-list checks inside the script, not from the deployment access setting. See [docs/SETUP.md §1](docs/SETUP.md#1-backend--google-sheets--apps-script).
- **This repository is public.** Real secrets — the Telegram bot token, chat IDs, OAuth client ID, Sheet/Drive IDs, and the deployed `/exec` URL — must **never** be committed. They live as `YOUR_..._HERE` placeholders in the repo and are filled in locally at deploy time (and reverted before pushing). See the placeholder convention in [docs/SETUP.md](docs/SETUP.md).
- **A CSP `eval` console warning may appear.** It originates from Google's `gsi/client` (the Google Sign-In library), not from this project's code, which contains no `eval`/`new Function`. It is not a vulnerability in this app.
- **Device labels are informational only.** The `DeviceLabel` shown in the `Sessions` tab is a best-effort parse of the user agent (browser + OS + model when detectable) and can be spoofed. It is for operator visibility, not a security control.

## For self-hosters — hardening checklist

- Keep all configuration as `YOUR_..._HERE` **placeholders in the repo**; inject real values locally at deploy and never commit them.
- **Ship a new Apps Script deployment version** after any `Code.gs` change — editing the script alone doesn't update the live `/exec` behavior.
- Set **your own email to `allow`** in the `AllowedUsers` tab (the first sign-in for every email, including the owner's, is auto-logged as `deny`), and add staff emails as needed.
- When upgrading from an older build, **delete a pre-existing 5-column `Sessions` tab** so it's recreated with the current 8-column header (see [docs/SETUP.md](docs/SETUP.md#the-sessions-tab)).
- **Restrict sharing** on the backing Google Sheet and Drive slip folder to only the accounts that need them.
- **Rotate the Telegram bot token** (via @BotFather) if it is ever exposed, and never paste it into a public issue, PR, or commit.
- Serve the app over **HTTPS** from an origin you control, and add only that origin to the OAuth client's Authorized JavaScript origins.

For day-to-day usage (including the **Lock** vs **Sign out & forget this device** options), see [docs/USAGE.md](docs/USAGE.md).
