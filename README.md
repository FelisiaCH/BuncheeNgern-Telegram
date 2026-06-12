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
- **🔔 Native cross-device Web Push** — any device that submits a transaction broadcasts a notification to every registered device, even when the PWA is closed or swiped from RAM
- **⚙️ In-app Settings panel** — Apps Script Web App URL and VAPID Public Key are entered directly in the UI and stored in `localStorage` — no source code editing required
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
[Any device submits a transaction]
        │
        ▼
  Google Sheets (new row appended)
        │
        ▼  onNewTransaction() trigger fires automatically
  Code.gs (Google Apps Script)
        │  generates VAPID JWT (ES256 / ECDSA P-256)
        │  broadcastPushNotification() loops every saved subscription
        │  and POSTs the payload via UrlFetchApp
        ▼
  Browser Push Service
  (FCM for Chrome  /  Mozilla Push for Firefox  /  APNs for Safari)
        │
        ▼  delivered even when the app is fully closed / swiped from RAM
  Service Worker (service-worker.js)
        │  push event fires → showNotification()
        ▼
  Every registered device's lock screen / notification tray
```

The notification reaches every subscribed device through the browser's own push infrastructure — the originating device, teammates' phones, and any other browser that has subscribed all receive it. The PWA does not need to be open or in memory; the Service Worker wakes briefly, shows the notification, then sleeps again.

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

> ## 🚨 CRITICAL WARNING — Container-Bound Script Required
>
> Do **not** create your project from [script.google.com](https://script.google.com/) using **New project**. That creates a **Standalone Script**, which is **not bound to your spreadsheet**.
>
> If you use a Standalone Script, the **`onNewTransaction` On-Change trigger in Step 4 will be impossible to configure** — the **"From spreadsheet" (จากสเปรดชีต)** event source and the **"On change" (เมื่อมีการเปลี่ยนแปลง)** event type will not appear as options in the Trigger dialog at all, because a standalone script has no spreadsheet to bind to. Cross-device push notifications will silently never fire.
>
> **You must create a Container-Bound Script instead:**
>
> 1. Open the Google Sheet you created in Step 1 directly in your browser.
> 2. In the top menu bar, click **Extensions (ส่วนขยาย)**.
> 3. Click **Apps Script**.
> 4. This opens a script editor that is permanently bound to this specific spreadsheet. Only this type of project will show "From spreadsheet" and "On change" as trigger options in Step 4.

1. With the container-bound editor open (from Extensions → Apps Script above), delete the empty `Code.gs` content, then paste in the full contents of [Code.gs](Code.gs) from this repository.

2. **Enable V8 Runtime — this is required.**
   - Click the gear icon **⚙️ Project Settings** in the left sidebar.
   - Under **Runtime version**, select **V8**.
   - Click **Save**.

   > The ECDSA P-256 signing engine uses `BigInt()`, which requires V8. The default Rhino runtime does not support BigInt and will fail.

3. Fill in your spreadsheet credentials **directly inside the Apps Script editor** — never commit real values to this repository:

   ```js
   const SPREADSHEET_ID  = 'YOUR_GOOGLE_SHEET_ID_HERE';
   const DRIVE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID_HERE';
   ```

4. Fill in your VAPID credentials (generated in [Step 3](#step-3--generate-and-configure-vapid-credentials) below):

   ```js
   const PUSH_VAPID_PUBLIC  = 'YOUR_VAPID_PUBLIC_KEY_HERE';
   const PUSH_VAPID_PRIVATE = 'YOUR_VAPID_PRIVATE_KEY_HERE';
   const PUSH_VAPID_SUBJECT = 'mailto:your-email@example.com';
   ```

5. Click **Deploy → New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and authorize all Google permission requests.

6. Copy the deployment URL. It follows this format:

   ```text
   https://script.google.com/macros/s/[YOUR_DEPLOYMENT_ID]/exec
   ```

   You will paste this into the FinTrack **Settings** panel in Step 5 — no source file needs to be edited.

---

### Step 3 — Generate and Configure VAPID Credentials

VAPID (Voluntary Application Server Identification) is the cryptographic proof that only your server can push notifications to your subscribers. Each deployment needs its own unique key pair.

#### Generate your key pair

Run these commands once on your local machine (`openssl` required). First, generate a P-256 private key file:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out vapid_private.pem
```

Next, export the public key. The output is a base64url string roughly 87 characters long — this value is safe to use in your Settings panel and in `Code.gs`:

```bash
openssl ec -in vapid_private.pem -pubout -outform DER 2>/dev/null | tail -c 65 | base64 | tr '+/' '-_' | tr -d '=\n'
```

Then export the private key. The output is a base64url string roughly 43 characters long — **never commit this value anywhere**:

```bash
openssl ec -in vapid_private.pem -outform DER 2>/dev/null | dd bs=1 skip=7 count=32 2>/dev/null | base64 | tr '+/' '-_' | tr -d '=\n'
```

Finally, delete the PEM file — you only need the two base64url strings produced above:

```bash
rm vapid_private.pem
```

#### Where each key belongs

**Public key** (safe to share — it is public by cryptographic design):

Open the FinTrack app, tap **⋮ More → ⚙️ ตั้งค่า / Settings**, paste the public key into the **VAPID Public Key** field, and tap **Save VAPID Key**. The value is stored in your browser's `localStorage` — no source file needs editing.

Also update `PUSH_VAPID_PUBLIC` in your Apps Script project with the same value:

```js
const PUSH_VAPID_PUBLIC = 'YOUR_VAPID_PUBLIC_KEY_HERE';
```

**Private key** (never commit, never paste into the frontend):

Open your Apps Script project at [script.google.com](https://script.google.com/) and locate this line:

```js
const PUSH_VAPID_PRIVATE = 'YOUR_VAPID_PRIVATE_KEY_HERE';
```

Replace `YOUR_VAPID_PRIVATE_KEY_HERE` with your generated private key **directly in the Apps Script editor**. Do not paste it into any file you would `git add`, and do not paste it into the FinTrack Settings panel — the frontend only ever needs the public key.

> **Security rule:** The private key must only ever exist inside the Apps Script editor (or a local secrets manager). If you accidentally paste it into a file and `git add` it, treat the key as permanently compromised — generate a brand new key pair immediately and rotate both values before pushing anything.

---

### Step 4 — Install the On-Change Trigger

This trigger fires `onNewTransaction()` automatically every time a new row is appended to your spreadsheet — regardless of which device submitted it.

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

> If **"From spreadsheet"** or **"On change"** does not appear in the dropdown options, your script project is a Standalone Script, not a Container-Bound Script. Go back to [Step 2](#step-2--deploy-the-google-apps-script-backend) and re-create the project via **Extensions → Apps Script** from inside the Google Sheet itself.
>
> `onNewTransaction` only acts when `e.changeType === 'INSERT_ROW'`. Edits, deletions, and other changes are ignored. When a new row is detected, it reads the Staff Name, Item Name, Currency, Price, Type, and Shop from that row and calls `broadcastPushNotification(title, body)`, which loops through every subscription stored in the `PushSubscriptions` sheet and dispatches a Web Push to each one.

---

### Step 5 — Connect the Frontend (Settings Panel)

All configuration now happens inside the app — no source file needs to be edited.

1. Open [index.html](index.html) in a browser, or visit your deployed GitHub Pages URL.
2. Tap the **⋮ More** button (top right of the app).
3. Under **⚙️ ตั้งค่า / Settings**:
   - Paste your Apps Script deployment URL (from Step 2.7) into the **App Token or Web App URL** field and tap **บันทึกสคริปต์**.
   - Paste your VAPID public key (from Step 3) into the **VAPID Public Key** field and tap **บันทึก VAPID Key**.
4. Both values are saved in `localStorage` and used immediately for all API requests and push subscriptions — the app is now fully connected to your backend.

---

### Step 6 — Subscribe Each Device to Web Push

Every device that should receive background notifications must subscribe individually. Each subscription is unique to that browser and device.

**On each device (mobile or desktop):**

1. Open the FinTrack PWA. On mobile, install it to the home screen first:
   - **Android (Chrome):** tap the browser menu → **Add to Home Screen**
   - **iOS (Safari):** tap the Share button → **Add to Home Screen**

2. Complete [Step 5](#step-5--connect-the-frontend-settings-panel) on this device if you haven't already — the VAPID public key must be saved before subscribing.

3. Tap **⋮ ตัวเลือกเพิ่มเติม** → **🔑 Request Notification Permission** — grant permission when prompted by the browser.

4. Tap **⋮ ตัวเลือกเพิ่มเติม** → **📲 Subscribe / สมัครรับการแจ้งเตือน**.

5. A JSON token panel appears, and the subscription is saved to your `PushSubscriptions` sheet automatically. Tap **📋 คัดลอกรหัส Token** if you need to copy it manually.

> Subscriptions are per-browser, per-device, and per-VAPID-key pair. If you regenerate your VAPID keys, all devices must re-subscribe.

---

### Step 7 — Test End-to-End

1. In the Apps Script editor, open **Execution log** (View → Logs).
2. Copy any subscription JSON string from column B of the `PushSubscriptions` sheet.
3. Run the following manually in the script editor console, replacing the placeholder with your copied subscription JSON:

   ```js
   sendWebPushNotification('FinTrack — ทดสอบ', 'มีรายการใหม่เข้าสาขา 1 ยอดเงิน 500 บาท', '{ ...paste your subscription JSON here... }');
   ```

4. Check the execution log — a `200 OK` response means the push service accepted the notification. The notification should appear on the target device within a few seconds.

5. For a full cross-device test, submit a transaction from one device and confirm that **every** subscribed device — including others — receives the notification via `broadcastPushNotification`.

---

## ⚠️ Apps Script Syntax Constraint — BigInt Literals

Apps Script's V8 parser **rejects** the `n`-suffix BigInt literal syntax at save time. Code such as the example below throws `ParseError: Unexpected token ILLEGAL` and cannot be saved:

```js
if (candidate >= 1n && candidate < _P256_N) return candidate;
while (exp > 0n) { }
```

Always use the `BigInt()` constructor instead — Apps Script V8 parses the constructor form correctly:

```js
if (candidate >= BigInt(1) && candidate < _P256_N) return candidate;
while (exp > BigInt(0)) { }
```

[Code.gs](Code.gs) already uses `_BI0`, `_BI1`, `_BI2`, `_BI3` constants throughout the ECDSA engine to avoid this pitfall. Do not rewrite those lines back to `n`-suffix syntax.

---

## 🚀 Running Locally

FinTrack is a single static HTML file — no `npm install`, no bundler, no server required.

If you use VS Code, the **Live Server** extension is the simplest option: right-click [index.html](index.html) and choose **Open with Live Server**.

Alternatively, serve the project directory with Python's built-in server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

> Service Workers and Web Push require HTTPS or `localhost`. The GitHub Pages deployment is always HTTPS and works out of the box.

---

## 🧹 Resetting Repository History (Advanced / Optional)

If you ever need to permanently wipe your fork's commit history — for example, after accidentally committing a secret — you can reinitialize the repository locally and force-push a single clean commit.

First, remove the existing Git history and start a fresh repository:

```bash
rm -rf .git
git init
git branch -M main
```

Next, stage and commit the current working tree as a single new initial commit:

```bash
git add .
git commit -m "initial: clean history"
```

Finally, re-link your remote and overwrite the remote history with a force push:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main --force
```

> **Warning:** `git push --force` permanently overwrites the remote branch history. Anyone with an existing clone will need to re-clone the repository. Any secret that was ever committed should still be treated as compromised and rotated — force-pushing removes it from the branch, but GitHub may retain unreferenced objects for a short period before garbage collection.

### 🖥️ Platform Compatibility (ความเข้ากันได้ของแพลตฟอร์ม)

The commands above use Unix-style syntax (`rm -rf`, forward-slash paths, etc.):

- **macOS and Linux:** these commands work natively in the default Terminal — no changes needed.
- **Windows:** run these commands in **Git Bash** (installed with Git for Windows) or **PowerShell**. In PowerShell, `rm -rf .git` works as an alias for `Remove-Item -Recurse -Force .git`; all other commands (`git init`, `git add`, `git commit`, `git remote`, `git push`) are identical across platforms since they are Git commands, not shell commands.

---

## 🧠 Why Serverless?

FinTrack has no server to rent or maintain. The entire backend runs on Google's infrastructure:

- **Google Sheets** — transaction database
- **Google Drive** — receipt photo storage
- **Google Apps Script Web App** — REST API + cross-device push notification dispatcher

The frontend stores your Apps Script URL, VAPID public key, session, language preference, and branch list in `localStorage` — no backend session, no cookies, no user database. Zero hosting cost. Your data stays in your own Google account.

---

## 🔒 Security Rules

| What | Rule |
| --- | --- |
| `SPREADSHEET_ID` | Paste in Apps Script editor only — never commit to this repo |
| `DRIVE_FOLDER_ID` | Same |
| `PUSH_VAPID_PRIVATE` | Generated locally, pasted in Apps Script editor only — treat like a password |
| `PUSH_VAPID_PUBLIC` | Safe to share — it is a public key by cryptographic design |
| VAPID Public Key (frontend) | Entered via the in-app Settings panel, stored in `localStorage` — never hardcoded in `index.html` |
| Deployment URL | Entered via the in-app Settings panel, stored in `localStorage` — keep private, it is your live API endpoint |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
