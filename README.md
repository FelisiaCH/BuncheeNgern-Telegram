# FinTrack

**Income & Expense Tracking System** — an installable PWA for logging daily income and expenses across multiple branches, with a Google Sheets backend and production-grade native Web Push Notifications delivered even when the app is completely closed or swiped from mobile RAM.

![Frontend](https://img.shields.io/badge/frontend-HTML%20%2F%20CSS%20%2F%20JS-2EE8B4)
![Backend](https://img.shields.io/badge/backend-Google%20Apps%20Script-4285F4)
![Push](https://img.shields.io/badge/push-Web%20Push%20%2F%20VAPID-FF6B6B)
![Build](https://img.shields.io/badge/build-none%20required-success)

---

## ✨ Features

- **🌐 Multi-language UI** — Lao, Thai, and English, switchable on the fly
- **🔐 Secure PIN login** — per-staff PIN authentication with lockout after failed attempts
- **🏪 Dynamic branch management** — add, rename, or remove shop branches from the UI
- **💱 Multi-currency support** — LAK, THB, and USD with live currency switching
- **📎 Smart receipt uploads** — drag-and-drop slip photos, auto-compressed before upload to Google Drive
- **📊 Live dashboard** — daily totals, metric cards, and filterable entry lists
- **🔔 Native Web Push** — real-time background notifications to devices even when the PWA is closed or swiped from RAM
- **🔊 Sound & vibration fallback** — audible chime on desktop; vibration on mobile when autoplay is blocked
- **📱 Installable PWA** — full home-screen install on iOS and Android via `manifest.json`

---

## 🧱 Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vanilla HTML / CSS / JS — single file, no frameworks, no build step |
| Backend | [Google Apps Script](https://www.google.com/script/start/) Web App (`Code.gs`) |
| Database | Google Sheets |
| File storage | Google Drive |
| Push delivery | Browser Web Push API + VAPID (RFC 8292) |

---

## 🔔 Web Push Architecture

FinTrack uses the **standard browser Web Push API** — no Firebase, no third-party push service, no monthly fees.

```text
[Staff submits a transaction]
        │
        ▼
  Google Sheets (new row appended)
        │
        ▼  onNewTransaction() trigger fires automatically
  Code.gs (Google Apps Script)
        │  generates VAPID JWT (ES256 / ECDSA P-256)
        │  POSTs notification payload via UrlFetchApp
        ▼
  Browser Push Service
  (FCM for Chrome  /  Mozilla Push for Firefox  /  APNs for Safari)
        │
        ▼  delivered even when the app is fully closed / swiped from RAM
  Service Worker (service-worker.js)
        │  push event fires → showNotification()
        ▼
  Device lock screen / notification tray
```

The notification reaches the device through the browser's own infrastructure — the PWA does not need to be open or in memory. The Service Worker wakes briefly, shows the notification, then sleeps again.

---

## ⚙️ Setup Guide

### Prerequisites

- A Google account (for Sheets, Drive, and Apps Script)
- The `openssl` command-line tool (to generate your VAPID key pair)

---

### Step 1 — Create the Google Sheet and Drive Folder

1. Create a new Google Sheet. This will be your transaction database.
2. Add a tab named exactly **`Users`** with these columns in row 1:

   | Column A | Column B | Column C |
   | --- | --- | --- |
   | Staff Name | PIN | Status |
   | Alice | 1234 | Active |
   | Bob | 5678 | Active |

   `Status` must be `Active` or `Locked`. Daily entry tabs are created automatically by the script.

3. Create a folder in Google Drive — uploaded receipt photos are stored here.
4. Note the **Sheet ID** (the long string in the Sheet URL) and the **Drive Folder ID** (same location in the folder URL). You will paste these into the script in Step 2.

---

### Step 2 — Deploy the Google Apps Script Backend

1. Open [script.google.com](https://script.google.com/) and create a **New project**.

2. Delete the empty `Code.gs` content, then paste in the full contents of [Code.gs](Code.gs) from this repository.

3. **Enable V8 Runtime — this is required.**
   - Click the gear icon **⚙️ Project Settings** in the left sidebar.
   - Under **Runtime version**, select **V8**.
   - Click **Save**.

   > The ECDSA P-256 signing engine uses `BigInt()`, which requires V8. The default Rhino runtime does not support BigInt and will fail.

4. Fill in your credentials **directly inside the Apps Script editor** — never commit real values to this repository:

   ```js
   const SPREADSHEET_ID  = 'YOUR_GOOGLE_SHEET_ID_HERE';
   const DRIVE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID_HERE';
   ```

5. Fill in your VAPID credentials (see [Step 3](#step-3--generate-and-configure-vapid-credentials) below):

   ```js
   const PUSH_VAPID_PUBLIC  = 'YOUR_VAPID_PUBLIC_KEY_HERE';
   const PUSH_VAPID_PRIVATE = 'YOUR_VAPID_PRIVATE_KEY_HERE';
   const PUSH_VAPID_SUBJECT = 'mailto:your-email@example.com';
   ```

6. Click **Deploy → New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and authorize all Google permission requests.

7. Copy the deployment URL — it looks like:

   ```text
   https://script.google.com/macros/s/[YOUR_DEPLOYMENT_ID]/exec
   ```

   You will paste this into the FinTrack frontend in Step 5.

---

### Step 3 — Generate and Configure VAPID Credentials

VAPID (Voluntary Application Server Identification) is the cryptographic proof that only your server can push notifications to your subscribers. Each deployment needs its own unique key pair.

#### Generate your key pair

Run these commands once on your local machine (`openssl` required):

```bash
# Step A: generate a P-256 private key file
openssl ecparam -name prime256v1 -genkey -noout -out vapid_private.pem

# Step B: export public key — base64url (~87 chars) — safe to use in index.html
openssl ec -in vapid_private.pem -pubout -outform DER 2>/dev/null \
  | tail -c 65 | base64 | tr '+/' '-_' | tr -d '=\n'

# Step C: export private key — base64url (~43 chars) — NEVER commit this value
openssl ec -in vapid_private.pem -outform DER 2>/dev/null \
  | dd bs=1 skip=7 count=32 2>/dev/null | base64 | tr '+/' '-_' | tr -d '=\n'

# Step D: delete the PEM file — you only need the two base64url strings above
rm vapid_private.pem
```

#### Where each key belongs

**Public key** (Step B output — safe to commit):

Open [index.html](index.html) and replace the `VAPID_PUBLIC_KEY` constant:

```js
const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE';
//                        ↑ paste your Step B output here
```

Also update `PUSH_VAPID_PUBLIC` in [Code.gs](Code.gs) with the same value.

**Private key** (Step C output — **never commit**):

Open your Apps Script project at [script.google.com](https://script.google.com/), find the line:

```js
const PUSH_VAPID_PRIVATE = 'YOUR_VAPID_PRIVATE_KEY_HERE';
```

Replace `YOUR_VAPID_PRIVATE_KEY_HERE` with your Step C output **directly in the Apps Script editor**. Do not paste it into any file you would `git add`.

> **Security rule:** The private key must only ever exist inside the Apps Script editor (or a local secrets manager). If you accidentally paste it into a file and `git add` it, treat the key as permanently compromised — generate a brand new key pair immediately and rotate both values before pushing anything.

---

### Step 4 — Install the On-Change Trigger

This trigger fires `onNewTransaction()` automatically every time a new row is appended to your spreadsheet.

1. In the Apps Script editor, click the **⏱ Triggers** icon in the left sidebar.
2. Click **+ Add Trigger** (bottom right).
3. Configure as follows:

   | Setting | Value |
   | --- | --- |
   | Function to run | `onNewTransaction` |
   | Deployment to run | Head |
   | Event source | From spreadsheet |
   | Event type | **On change** |

4. Click **Save**. Google will ask you to re-authorize — accept all permissions.

> `onNewTransaction` only acts when `e.changeType === 'INSERT_ROW'`. Edits, deletions, and other changes are ignored, so the trigger fires exclusively on new transaction submissions.

---

### Step 5 — Connect the Frontend to Your Backend

1. Open [index.html](index.html) in a browser, or visit your deployed GitHub Pages URL.
2. Tap the **⋮ More** button (top right of the app).
3. Under **Credentials**, paste your Apps Script deployment URL and tap **บันทึกสคริปต์**.
4. The frontend is now connected to your backend.

---

### Step 6 — Subscribe Each Device to Web Push

Every device that should receive background notifications must subscribe individually. Each subscription is unique to that browser and device.

**On each device (mobile or desktop):**

1. Open the FinTrack PWA. On mobile, install it to the home screen first:
   - **Android (Chrome):** tap the browser menu → **Add to Home Screen**
   - **iOS (Safari):** tap the Share button → **Add to Home Screen**

2. Tap **⋮ ตัวเลือกเพิ่มเติม** → **🔑 Request Notification Permission** — grant permission when prompted by the browser.

3. Tap **⋮ ตัวเลือกเพิ่มเติม** → **📲 Subscribe / สมัครรับการแจ้งเตือน**.

4. A JSON token panel appears. Tap **📋 คัดลอกรหัส Token** to copy the subscription token.

5. The token is saved to your `PushSubscriptions` sheet automatically (if the app is connected to the backend). If you need to paste it manually, open your Google Sheet, go to the **`PushSubscriptions`** tab, and paste the JSON into column B of a new row.

> Subscriptions are per-browser, per-device, and per-VAPID-key pair. If you regenerate your VAPID keys, all devices must re-subscribe.

---

### Step 7 — Test End-to-End

1. In the Apps Script editor, open **Execution log** (View → Logs).
2. Copy any subscription JSON string from column B of the `PushSubscriptions` sheet.
3. Run the following manually in the script editor console:

   ```js
   sendWebPushNotification(
     'FinTrack — ทดสอบ',
     'มีรายการใหม่เข้าสาขา 1 ยอดเงิน 500 บาท',
     '{ ...paste your subscription JSON here... }'
   );
   ```

4. Check the execution log — a `200 OK` response means the push service accepted the notification. The notification should appear on the target device within a few seconds.

---

## ⚠️ Apps Script Syntax Constraint — BigInt Literals

Apps Script's V8 parser **rejects** the `n`-suffix BigInt literal syntax at save time:

```js
// ❌ ParseError: Unexpected token ILLEGAL — Apps Script will refuse to save this
if (candidate >= 1n && candidate < _P256_N) return candidate;
while (exp > 0n) { ... }
```

Always use the `BigInt()` constructor instead:

```js
// ✅ Correct — Apps Script V8 parses the constructor but not the literal suffix
if (candidate >= BigInt(1) && candidate < _P256_N) return candidate;
while (exp > BigInt(0)) { ... }
```

[Code.gs](Code.gs) already uses `_BI0`, `_BI1`, `_BI2`, `_BI3` constants throughout the ECDSA engine to avoid this pitfall. Do not rewrite those lines back to `n`-suffix syntax.

---

## 🚀 Running Locally

FinTrack is a single static HTML file — no `npm install`, no bundler, no server required.

```bash
# Option A: VS Code Live Server extension (recommended)
# Right-click index.html → Open with Live Server

# Option B: Python one-liner
python3 -m http.server 8080
# then open http://localhost:8080
```

> Service Workers and Web Push require HTTPS or `localhost`. The GitHub Pages deployment is always HTTPS and works out of the box.

---

## 🧠 Why Serverless?

FinTrack has no server to rent or maintain. The entire backend runs on Google's infrastructure:

- **Google Sheets** — transaction database
- **Google Drive** — receipt photo storage
- **Google Apps Script Web App** — REST API + push notification dispatcher

The frontend stores your script URL, session, language preference, and branch list in `localStorage` — no backend session, no cookies, no user database. Zero hosting cost. Your data stays in your own Google account.

---

## 🔒 Security Rules

| What | Rule |
| --- | --- |
| `SPREADSHEET_ID` | Paste in Apps Script editor only — never commit to this repo |
| `DRIVE_FOLDER_ID` | Same |
| `PUSH_VAPID_PRIVATE` | Generated locally, pasted in Apps Script editor only — treat like a password |
| `PUSH_VAPID_PUBLIC` | Safe to commit — it is a public key by cryptographic design |
| Deployment URL | Keep private — it is your live API endpoint |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
