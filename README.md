# FinTrack

**Income & Expense Tracking System** — an installable PWA for logging daily income and expenses across multiple branches, backed by a Google-authenticated Apps Script Web App over Google Sheets, with instant cross-device Telegram notifications for every new transaction.

![Frontend](https://img.shields.io/badge/frontend-HTML%20%2F%20CSS%20%2F%20JS-2EE8B4)
![Backend](https://img.shields.io/badge/backend-Google%20Apps%20Script-4285F4)
![Auth](https://img.shields.io/badge/auth-Google%20Sign--in-EA4335)
![Notifications](https://img.shields.io/badge/notifications-Telegram%20Bot%20API-26A5E4)
![Build](https://img.shields.io/badge/build-none%20required-success)

---

This README is provided in two languages. Pick the section for your preferred language — both cover the same setup steps.

- [🇺🇸 English Setup Guide](#-english-setup-guide)
- [🇹🇭 คู่มือการตั้งค่าภาษาไทย](#-คู่มือการตั้งค่าภาษาไทย)

---

## 🇺🇸 English Setup Guide

## ✨ Features

- **🌐 Multi-language UI** — English, Thai, Lao, Vietnamese, and Burmese, switchable on the fly. All translation strings live in [lang.js](lang.js).
- **🔐 Secure PIN login** — per-staff PIN authentication with lockout after failed attempts
- **🏪 Dynamic branch management** — add, rename, or remove shop branches from the UI
- **💱 Multi-currency support** — LAK, THB, and USD with live currency switching
- **📎 Smart receipt uploads** — drag-and-drop slip photos, auto-compressed before upload to Google Drive
- **📊 Live dashboard** — daily totals, metric cards, and filterable entry lists
- **📲 Instant Telegram notifications** — every new transaction, from any device, sends a formatted message straight to your Telegram chat via the Telegram Bot API
- **⚙️ Standalone Settings page** — a dedicated bottom-nav tab for language, theme, connection, and branch management, replacing the old 3-dot menu
- **🌗 Light / Dark mode** — instant theme switching via CSS variables, persisted to `localStorage`, no page reload required
- **⚙️ In-app Settings panel** — Apps Script Web App URL is entered directly in the UI and stored in `localStorage` — no source code editing required
- **🔊 Sound & vibration fallback** — audible chime on desktop; vibration on mobile when autoplay is blocked
- **📱 Installable PWA** — full home-screen install on iOS and Android via `manifest.json`

---

## 🧱 Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Vanilla HTML / CSS / JS — [index.html](index.html) + [lang.js](lang.js), no frameworks, no build step |
| Backend | [Google Apps Script](https://www.google.com/script/start/) Web App (`Code.gs`) |
| Database | Google Sheets |
| File storage | Google Drive |
| Notification delivery | Telegram Bot API (`UrlFetchApp.fetch`) |
| Offline cache | [service-worker.js](service-worker.js) — caches `index.html` and `lang.js` for offline use |

---

## 📲 Telegram Notification Architecture

FinTrack sends notifications using a **direct server-side Telegram Bot** — no Firebase, no VAPID keys, no browser push permissions, no monthly fees.

```text
[Any device submits a transaction]
        │
        ▼
  doPost(e) → submitEntry(data)
        │
        ▼  row appended to Google Sheets
  Code.gs (Google Apps Script)
        │  formats a message with staff name, item, shop, and amount
        │  sendTelegramNotification(message)
        ▼
  Telegram Bot API
  (https://api.telegram.org/bot<TOKEN>/sendMessage)
        ▼
  Your Telegram chat — instantly, on every device where Telegram is installed
```

Because the message is sent directly from the same server-side execution that writes the row, it bypasses Google's spreadsheet trigger isolation entirely — notifications fire reliably regardless of which device submitted the entry.

---

## ⚙️ Setup Guide

### Prerequisites

- A Google account (for Sheets, Drive, and Apps Script)
- A Telegram account

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

### Step 2 — Create a Telegram Bot and Get Your Chat ID

1. In Telegram, open a chat with **[@BotFather](https://t.me/BotFather)** and send `/newbot`. Follow the prompts to name your bot.
2. BotFather replies with a **bot token** — a string like `123456789:AAExampleTokenStringHere`. Copy it.
3. Start a chat with your new bot (search for its username and send it any message — e.g. `/start`).
4. Get your **chat ID** by visiting this URL in your browser, replacing `<TOKEN>` with your bot token:

   ```text
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```

5. Find `"chat":{"id":...}` in the JSON response — that number is your **chat ID**.

---

### Step 3 — Deploy the Google Apps Script Backend

> ## 🚨 CRITICAL WARNING — Container-Bound Script Required
>
> Do **not** create your project from [script.google.com](https://script.google.com/) using **New project**. That creates a **Standalone Script**, which is **not bound to your spreadsheet** and breaks the core automation tools that read and write your sheet.
>
> **You must create a Container-Bound Script instead:**
>
> 1. Open the Google Sheet you created in Step 1 directly in your browser.
> 2. In the top menu bar, click **Extensions (ส่วนขยาย)**.
> 3. Click **Apps Script**.
> 4. This opens a script editor that is permanently bound to this specific spreadsheet — only this type of project can read and write the sheet correctly.

1. With the container-bound editor open (from Extensions → Apps Script above), delete the empty `Code.gs` content, then paste in the full contents of [Code.gs](Code.gs) from this repository.

2. Fill in your spreadsheet credentials **directly inside the Apps Script editor** — never commit real values to this repository:

   ```js
   const SPREADSHEET_ID  = 'YOUR_GOOGLE_SHEET_ID_HERE';
   const DRIVE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID_HERE';
   ```

3. Fill in your Telegram credentials from Step 2:

   ```js
   const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
   const TELEGRAM_CHAT_ID   = 'YOUR_TELEGRAM_CHAT_ID_HERE';
   ```

   > **Security rule:** Both values must only ever exist inside the Apps Script editor. Never paste them into any file you would `git add`. If you accidentally commit them, treat both as compromised — revoke the bot token via [@BotFather](https://t.me/BotFather) (`/revoke`) and generate a new one.

4. Click **Deploy → New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and authorize all Google permission requests.

   > **Why these settings matter:** **Execute as: Me** runs every request under your own Google account permissions, and **Who has access: Anyone** allows the deployment to be called directly from the browser without a Google sign-in redirect. This avoids the CORS/Network Error that blocks `fetch()` requests when the script requires the caller's own Google session. FinTrack's optional "Sign in with Google" button on the login screen is separate — it only attaches the signed-in staff member's email to each entry for the Telegram notification, it does not change how the Apps Script executes.

5. Copy the deployment URL. It follows this format:

   ```text
   https://script.google.com/macros/s/[YOUR_DEPLOYMENT_ID]/exec
   ```

   You will paste this into the FinTrack **Settings** panel in Step 4 — no source file needs to be edited.

---

### Step 4 — Connect the Frontend (Settings Panel)

All configuration now happens inside the app — no source file needs to be edited.

1. Open [index.html](index.html) in a browser, or visit your deployed GitHub Pages URL.
2. Tap the **⋮ More** button (top right of the app).
3. Under **⚙️ Settings**, paste your Apps Script deployment URL (from Step 3.5) into the **App Token or Web App URL** field and tap **Save Script**.
4. The value is saved in `localStorage` and used immediately for all API requests — the app is now fully connected to your backend.

---

### Step 5 — Test End-to-End

1. In the FinTrack app, submit a test transaction (any item, amount, and branch).
2. Check your Telegram chat with the bot — within a few seconds you should receive a message formatted like:

   ```text
   🔔 มีรายการใหม่เข้ามา!
   👤 ผู้บันทึก: Alice
   💸 รายการ: Service [สาขา 1]
   💰 ยอดเงิน: 500 LAK
   ```

3. If no message arrives, open the Apps Script editor's **Execution log** (View → Logs) and check for `[Telegram]` entries — a `200 OK` response means Telegram accepted the message; a `4xx` error usually means the bot token or chat ID is incorrect.

---

## 🚀 Running Locally

FinTrack is a set of static files — [index.html](index.html), [lang.js](lang.js), [service-worker.js](service-worker.js) — no `npm install`, no bundler, no server required.

If you use VS Code, the **Live Server** extension is the simplest option: right-click [index.html](index.html) and choose **Open with Live Server**.

Alternatively, serve the project directory with Python's built-in server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

> Service Workers require HTTPS or `localhost`. The GitHub Pages deployment is always HTTPS and works out of the box.

---

## 🧠 Why Serverless?

FinTrack has no server to rent or maintain. The entire backend runs on Google's infrastructure plus Telegram's free Bot API:

- **Google Sheets** — transaction database
- **Google Drive** — receipt photo storage
- **Google Apps Script Web App** — REST API + Telegram notification dispatcher
- **Telegram Bot API** — instant cross-device notification delivery

The frontend stores your Apps Script URL, session, language preference, and branch list in `localStorage` — no backend session, no cookies, no user database. Zero hosting cost. Your data stays in your own Google account.

---

## 🔒 Security Rules

| What | Rule |
| --- | --- |
| `SPREADSHEET_ID` | Paste in Apps Script editor only — never commit to this repo |
| `DRIVE_FOLDER_ID` | Same |
| `TELEGRAM_BOT_TOKEN` | Paste in Apps Script editor only — never commit to this repo. Treat like a password; revoke and regenerate via @BotFather if ever exposed |
| `TELEGRAM_CHAT_ID` | Paste in Apps Script editor only — never commit to this repo |
| Deployment URL | Entered via the in-app Settings panel, stored in `localStorage` — keep private, it is your live API endpoint |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

---

## 🇹🇭 คู่มือการตั้งค่าภาษาไทย

## ✨ ฟีเจอร์

- **🌐 รองรับหลายภาษา** — อังกฤษ, ไทย, ลาว, เวียดนาม และพม่า สามารถสลับได้ทันที คำแปลทั้งหมดอยู่ในไฟล์ [lang.js](lang.js)
- **🔐 เข้าสู่ระบบด้วย PIN ที่ปลอดภัย** — ยืนยันตัวตนด้วย PIN รายบุคคล พร้อมล็อกบัญชีหากกรอกผิดหลายครั้ง
- **🏪 จัดการสาขาแบบไดนามิก** — เพิ่ม เปลี่ยนชื่อ หรือลบสาขาได้จากหน้าแอปโดยตรง
- **💱 รองรับหลายสกุลเงิน** — LAK, THB และ USD พร้อมสลับสกุลเงินได้แบบเรียลไทม์
- **📎 แนบสลิปอัจฉริยะ** — ลากวางรูปสลิป ระบบบีบอัดอัตโนมัติก่อนอัปโหลดไป Google Drive
- **📊 แดชบอร์ดแบบเรียลไทม์** — ยอดรวมรายวัน การ์ดสรุปข้อมูล และรายการที่กรองได้
- **📲 แจ้งเตือนผ่าน Telegram ทันที** — เมื่อมีการบันทึกรายการจากอุปกรณ์ใด ระบบจะส่งข้อความที่จัดรูปแบบแล้วไปยังแชท Telegram ของคุณผ่าน Telegram Bot API
- **⚙️ หน้าตั้งค่าแบบแยกหน้า** — แท็บใหม่บน Bottom Nav รวมภาษา ธีม การเชื่อมต่อ และการจัดการสาขา แทนที่เมนู 3 จุดแบบเดิม
- **🌗 โหมดสว่าง / มืด** — สลับธีมได้ทันทีด้วย CSS Variables บันทึกใน `localStorage` ไม่ต้องโหลดหน้าใหม่
- **⚙️ แผงตั้งค่าในแอป** — กรอก Apps Script Web App URL ได้จากหน้าแอปโดยตรง บันทึกใน `localStorage` ไม่ต้องแก้ไขซอร์สโค้ด
- **🔊 เสียงและการสั่นสำรอง** — มีเสียงเตือนบนเดสก์ท็อป และสั่นบนมือถือเมื่อเล่นเสียงอัตโนมัติถูกบล็อก
- **📱 ติดตั้งเป็น PWA ได้** — ติดตั้งบนหน้าจอหลักของ iOS และ Android ผ่าน `manifest.json`

---

## 🧱 เทคโนโลยีที่ใช้

| ส่วน | เทคโนโลยี |
| --- | --- |
| Frontend | HTML / CSS / JS ธรรมดา — [index.html](index.html) + [lang.js](lang.js) ไม่ใช้เฟรมเวิร์ก ไม่ต้องมีขั้นตอน build |
| Backend | [Google Apps Script](https://www.google.com/script/start/) Web App (`Code.gs`) |
| ฐานข้อมูล | Google Sheets |
| ที่จัดเก็บไฟล์ | Google Drive |
| การส่งแจ้งเตือน | Telegram Bot API (`UrlFetchApp.fetch`) |
| แคชออฟไลน์ | [service-worker.js](service-worker.js) — แคช `index.html` และ `lang.js` เพื่อใช้งานออฟไลน์ |

---

## 📲 สถาปัตยกรรมการแจ้งเตือนผ่าน Telegram

FinTrack ส่งการแจ้งเตือนด้วย **Telegram Bot ฝั่งเซิร์ฟเวอร์โดยตรง** — ไม่ใช้ Firebase ไม่ต้องมี VAPID key ไม่ต้องขอสิทธิ์ push ของเบราว์เซอร์ ไม่มีค่าใช้จ่ายรายเดือน

```text
[อุปกรณ์ใดบันทึกรายการ]
        │
        ▼
  doPost(e) → submitEntry(data)
        │
        ▼  เพิ่มแถวใหม่ใน Google Sheets
  Code.gs (Google Apps Script)
        │  จัดรูปแบบข้อความด้วยชื่อพนักงาน รายการ สาขา และยอดเงิน
        │  sendTelegramNotification(message)
        ▼
  Telegram Bot API
  (https://api.telegram.org/bot<TOKEN>/sendMessage)
        ▼
  แชท Telegram ของคุณ — ทันที บนทุกอุปกรณ์ที่ติดตั้ง Telegram
```

เนื่องจากข้อความถูกส่งโดยตรงจากการทำงานฝั่งเซิร์ฟเวอร์เดียวกันกับที่เขียนแถวข้อมูล จึงข้ามข้อจำกัดของ trigger บนสเปรดชีตของ Google ไปได้ทั้งหมด — การแจ้งเตือนจะทำงานได้อย่างน่าเชื่อถือไม่ว่าจะบันทึกรายการจากอุปกรณ์ใดก็ตาม

---

## ⚙️ คู่มือการติดตั้ง

### สิ่งที่ต้องมีก่อน

- บัญชี Google (สำหรับ Sheets, Drive และ Apps Script)
- บัญชี Telegram

---

### ขั้นที่ 1 — สร้าง Google Sheet และโฟลเดอร์ Drive

1. สร้าง Google Sheet ใหม่ ใช้เป็นฐานข้อมูลรายการธุรกรรม
2. เพิ่มแท็บชื่อ **`Users`** (ต้องตรงตามนี้) พร้อมหัวคอลัมน์แถวที่ 1:

   | คอลัมน์ A | คอลัมน์ B | คอลัมน์ C |
   | --- | --- | --- |
   | Staff Name | PIN | Status |
   | Alice | 1234 | Active |
   | Bob | 5678 | Active |

   `Status` ต้องเป็น `Active` หรือ `Locked` แท็บรายการรายวันจะถูกสร้างขึ้นโดยสคริปต์โดยอัตโนมัติ

3. สร้างโฟลเดอร์ใน Google Drive — ใช้เก็บรูปสลิปที่อัปโหลด
4. จด **Sheet ID** (สตริงยาวในลิงก์ของ Sheet) และ **Drive Folder ID** (ตำแหน่งเดียวกันในลิงก์โฟลเดอร์) เพื่อนำไปใส่ในสคริปต์ในขั้นที่ 3

---

### ขั้นที่ 2 — สร้าง Telegram Bot และหา Chat ID

1. ใน Telegram เปิดแชทกับ **[@BotFather](https://t.me/BotFather)** แล้วส่งคำสั่ง `/newbot` ทำตามขั้นตอนเพื่อตั้งชื่อบอทของคุณ
2. BotFather จะตอบกลับด้วย **bot token** — สตริงรูปแบบ `123456789:AAExampleTokenStringHere` ให้คัดลอกไว้
3. เริ่มแชทกับบอทใหม่ของคุณ (ค้นหา username ของบอท แล้วส่งข้อความใดก็ได้ เช่น `/start`)
4. หา **chat ID** ของคุณโดยเปิด URL นี้ในเบราว์เซอร์ แทนที่ `<TOKEN>` ด้วย bot token ของคุณ:

   ```text
   https://api.telegram.org/bot<TOKEN>/getUpdates
   ```

5. มองหา `"chat":{"id":...}` ในผลลัพธ์ JSON — ตัวเลขนั้นคือ **chat ID** ของคุณ

---

### ขั้นที่ 3 — ติดตั้ง Backend ด้วย Google Apps Script

> ## 🚨 คำเตือนสำคัญ — ต้องใช้ Container-Bound Script เท่านั้น
>
> **อย่า** สร้างโปรเจกต์จาก [script.google.com](https://script.google.com/) ด้วยปุ่ม **New project** เพราะวิธีนี้จะสร้าง **Standalone Script** ซึ่ง **ไม่ได้ผูกกับสเปรดชีตของคุณ** และจะทำให้เครื่องมืออัตโนมัติหลักที่อ่าน/เขียนชีตของคุณทำงานผิดพลาด
>
> **คุณต้องสร้าง Container-Bound Script แทน ด้วยวิธีนี้:**
>
> 1. เปิด Google Sheet ที่สร้างในขั้นที่ 1 ในเบราว์เซอร์
> 2. ที่เมนูด้านบน คลิก **Extensions (ส่วนขยาย)**
> 3. คลิก **Apps Script**
> 4. ระบบจะเปิดตัวแก้ไขสคริปต์ที่ผูกกับสเปรดชีตนี้อย่างถาวร — เฉพาะโปรเจกต์ประเภทนี้เท่านั้นที่จะอ่าน/เขียนชีตได้อย่างถูกต้อง

1. เมื่อเปิดตัวแก้ไขแบบ container-bound แล้ว (จาก Extensions → Apps Script ด้านบน) ให้ลบเนื้อหาเปล่าใน `Code.gs` แล้ววางเนื้อหาทั้งหมดจาก [Code.gs](Code.gs) ในรีโพนี้

2. กรอกข้อมูลของสเปรดชีต **ในตัวแก้ไข Apps Script เท่านั้น** — ห้าม commit ค่าจริงเข้ารีโพนี้:

   ```js
   const SPREADSHEET_ID  = 'YOUR_GOOGLE_SHEET_ID_HERE';
   const DRIVE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID_HERE';
   ```

3. กรอกข้อมูล Telegram จากขั้นที่ 2:

   ```js
   const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
   const TELEGRAM_CHAT_ID   = 'YOUR_TELEGRAM_CHAT_ID_HERE';
   ```

   > **กฎความปลอดภัย:** ค่าทั้งสองต้องอยู่ในตัวแก้ไข Apps Script เท่านั้น ห้ามวางลงในไฟล์ที่จะ `git add` หากวางผิดและ commit ไปแล้ว ให้ถือว่ารั่วไหลทันที — เพิกถอน bot token ผ่าน [@BotFather](https://t.me/BotFather) (`/revoke`) แล้วสร้างใหม่

4. คลิก **Deploy → New deployment**:
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - คลิก **Deploy** และอนุญาตสิทธิ์ที่ Google ขอทั้งหมด

   > **เหตุผลที่ต้องตั้งค่าแบบนี้:** **Execute as: Me** จะรันทุกคำขอด้วยสิทธิ์บัญชี Google ของคุณเอง และ **Who has access: Anyone** จะทำให้เรียกใช้ deployment นี้ได้ตรงจากเบราว์เซอร์โดยไม่ต้อง redirect ไปล็อกอิน Google ก่อน ซึ่งช่วยแก้ปัญหา CORS/Network Error ที่บล็อกคำขอ `fetch()` เมื่อสคริปต์ต้องใช้ session ของผู้เรียกเอง ปุ่ม "เข้าสู่ระบบด้วย Google" ที่หน้า login ของ FinTrack เป็นคนละส่วนกัน — มีไว้เพียงแนบอีเมลของพนักงานที่ล็อกอินไปกับแต่ละรายการเพื่อแจ้งผ่าน Telegram เท่านั้น ไม่มีผลต่อการรัน Apps Script

5. คัดลอก URL การ deploy ซึ่งจะมีรูปแบบดังนี้:

   ```text
   https://script.google.com/macros/s/[YOUR_DEPLOYMENT_ID]/exec
   ```

   คุณจะนำ URL นี้ไปวางในแผง **Settings** ของ FinTrack ในขั้นที่ 4 — ไม่ต้องแก้ไฟล์ใด ๆ

---

### ขั้นที่ 4 — เชื่อมต่อ Frontend (แผง Settings)

การตั้งค่าทั้งหมดทำได้จากในแอป ไม่ต้องแก้ไฟล์ใด ๆ

1. เปิด [index.html](index.html) ในเบราว์เซอร์ หรือเข้า URL ที่ deploy บน GitHub Pages
2. แตะปุ่ม **⋮ More** (มุมขวาบนของแอป)
3. ภายใต้ **⚙️ ตั้งค่า / Settings** วาง URL การ deploy ของ Apps Script (จากขั้นที่ 3.5) ในช่อง **App Token or Web App URL** แล้วแตะ **บันทึกสคริปต์**
4. ค่านี้จะถูกบันทึกใน `localStorage` และใช้งานทันทีสำหรับทุก API request — แอปพร้อมเชื่อมต่อกับ backend ของคุณแล้ว

---

### ขั้นที่ 5 — ทดสอบแบบ End-to-End

1. ในแอป FinTrack ให้บันทึกรายการทดสอบ (รายการ จำนวนเงิน และสาขาใดก็ได้)
2. ตรวจสอบแชท Telegram ที่คุยกับบอทของคุณ — ภายในไม่กี่วินาทีคุณควรได้รับข้อความรูปแบบนี้:

   ```text
   🔔 มีรายการใหม่เข้ามา!
   👤 ผู้บันทึก: Alice
   💸 รายการ: Service [สาขา 1]
   💰 ยอดเงิน: 500 LAK
   ```

3. หากไม่มีข้อความเข้า ให้เปิด **Execution log** ในตัวแก้ไข Apps Script (View → Logs) แล้วมองหารายการ `[Telegram]` — ผลลัพธ์ `200 OK` แปลว่า Telegram รับข้อความแล้ว ส่วน error `4xx` มักหมายถึง bot token หรือ chat ID ไม่ถูกต้อง

---

## 🚀 การรันในเครื่อง

FinTrack คือไฟล์สแตติกชุดเดียว — [index.html](index.html), [lang.js](lang.js), [service-worker.js](service-worker.js) — ไม่ต้อง `npm install` ไม่ต้องใช้ bundler ไม่ต้องมีเซิร์ฟเวอร์

หากใช้ VS Code ส่วนขยาย **Live Server** เป็นวิธีที่ง่ายที่สุด: คลิกขวาที่ [index.html](index.html) แล้วเลือก **Open with Live Server**

หรือเปิดเซิร์ฟเวอร์ในตัวของ Python จากไดเรกทอรีของโปรเจกต์:

```bash
python3 -m http.server 8080
```

จากนั้นเปิด `http://localhost:8080` ในเบราว์เซอร์

> Service Worker ต้องใช้ HTTPS หรือ `localhost` การ deploy บน GitHub Pages เป็น HTTPS อยู่แล้วจึงใช้งานได้ทันที

---

## 🧠 ทำไมไม่ต้องมีเซิร์ฟเวอร์?

FinTrack ไม่มีเซิร์ฟเวอร์ให้เช่าหรือดูแล ระบบ backend ทั้งหมดทำงานบนโครงสร้างพื้นฐานของ Google รวมกับ Telegram Bot API ที่ใช้งานฟรี:

- **Google Sheets** — ฐานข้อมูลรายการธุรกรรม
- **Google Drive** — ที่เก็บรูปสลิป
- **Google Apps Script Web App** — REST API และตัวส่งแจ้งเตือนผ่าน Telegram
- **Telegram Bot API** — ส่งการแจ้งเตือนข้ามอุปกรณ์แบบทันที

ฝั่ง frontend จะบันทึก Apps Script URL, session, ภาษาที่เลือก และรายชื่อสาขาไว้ใน `localStorage` — ไม่มี backend session ไม่มี cookie ไม่มีฐานข้อมูลผู้ใช้ ไม่มีค่าใช้จ่ายในการโฮสต์ ข้อมูลของคุณอยู่ในบัญชี Google ของคุณเองเท่านั้น

---

## 🔒 กฎความปลอดภัย

| รายการ | กฎ |
| --- | --- |
| `SPREADSHEET_ID` | วางในตัวแก้ไข Apps Script เท่านั้น — ห้าม commit เข้ารีโพนี้ |
| `DRIVE_FOLDER_ID` | เช่นเดียวกัน |
| `TELEGRAM_BOT_TOKEN` | วางในตัวแก้ไข Apps Script เท่านั้น — ห้าม commit เข้ารีโพนี้ ต้องดูแลเหมือนรหัสผ่าน หากรั่วไหลให้เพิกถอนและสร้างใหม่ผ่าน @BotFather |
| `TELEGRAM_CHAT_ID` | วางในตัวแก้ไข Apps Script เท่านั้น — ห้าม commit เข้ารีโพนี้ |
| Deployment URL | กรอกผ่านแผง Settings ในแอป บันทึกใน `localStorage` — เก็บเป็นความลับ เพราะเป็น endpoint API จริงของคุณ |

---

## 📄 สัญญาอนุญาต

โปรเจกต์นี้อยู่ภายใต้ [MIT License](LICENSE)
