# FinTrack — Usage Guide

Day-to-day guide for staff using the app after a fork has been set up. For initial setup (Apps Script, OAuth, hosting), see the [README](../README.md).

---

## First run: add currencies

The currency list starts **empty**. Before you can log anything, open **Settings ▸ Manage Currencies** and add at least one entry:

1. Type a **code** (e.g. `LAK`) in the first field.
2. Type a **symbol** (e.g. `₭`) in the second field.
3. Tap **Add Currency**.

Repeat for every currency your operation uses. The app blocks submission and the "+ Add Currency" row button with a warning until at least one currency exists.

> Removing a currency later does **not** delete past entries — they still appear on the dashboard. The currency tab for it will continue to show as long as that day's data contains it.

---

## Logging an entry

1. Open the **Record** tab (pencil icon, bottom nav).
2. Choose **Income** or **Expense**.
3. Type or select an **item name** — previously used names appear in a dropdown as you type.
4. Choose a **currency** from the selector and enter the **amount**.
5. Select the **branch** (chip buttons below the amount row).
6. Choose the **payment method**: **Cash** or **Lao QR / OnePay**.
7. Tap **Save Entry**.

On success a toast confirms the save. If the Telegram notification failed separately, a second toast says so (the entry is still saved).

### Attaching a slip

When **Lao QR / OnePay** is selected, an upload zone appears below the payment method row. Tap it or drag-and-drop a photo:

- Maximum file size before compression: **5 MB**.
- The browser automatically resizes the image to at most **1280 px** on its longest side and re-encodes it as JPEG at **~82% quality** before uploading, so the actual upload is smaller.
- After attaching, a preview appears. Tap **✕ Remove Slip** to clear it.
- A slip is **required** when QR / OnePay is selected; submission is blocked without one.

---

## Multiple currencies in one transaction

One bill can span several currencies (e.g. part paid in LAK, part in THB):

1. Enter the first currency and amount in the main row.
2. Tap **+ Add Currency** to add an extra row.
3. Choose the currency and amount for that row.
4. Add as many rows as needed.
5. Tap **Save Entry**.

Each currency line is saved as a separate row in the sheet, but all rows from one submission share the same **Transaction ID** so they can be grouped later. The dashboard entry count shows **bills** (distinct Transaction IDs), not rows — so a 3-currency transaction counts as one entry.

---

## Managing currencies

**Settings ▸ Manage Currencies** (scroll down in the Settings tab):

- **Add:** enter a code and symbol, tap **Add Currency**. Duplicate codes (case-insensitive) are rejected.
- **Remove:** tap ❌ next to any currency and confirm. Past entries using it are kept and still show on the dashboard.
- The dashboard's currency tabs always show the **union** of configured currencies and any currency code already present in the current day's data, so deleting a currency never hides historical totals.

---

## Managing branches

**Settings ▸ Management** (the section above Manage Currencies):

- **Add:** type a branch name and tap **Add New Branch** (or press Enter).
- **Remove:** tap ❌ next to a branch and confirm. At least one branch is required.

The active branch is selected via the chip buttons on the **Record** tab. The dashboard's branch filter lets you view totals for one branch or all branches at once.

---

## Reading the dashboard

Open the **Summary** tab (chart icon, bottom nav).

| Control | What it does |
|---|---|
| ◀ / ▶ arrows | Navigate between days. Future dates are blocked. |
| Branch chips | Filter totals and entry list to one branch, or show all. |
| Currency tabs | Switch between currencies. A tab only appears if at least one of that currency exists in the configured list or in today's data. |
| Refresh button | Force-reload data from the sheet (useful if entries were added elsewhere). |

**Per-currency cards** show three numbers for the active currency and day (after any branch filter):

- **Cash Income** — sum of Income entries paid by Cash.
- **QR / OnePay Income** — sum of Income entries paid by QR.
- **Total Expenses** — sum of all Expense entries.

**Entry count badge** (top-right of the Summary tab) counts **distinct bills**, not rows. A multi-currency transaction that writes three rows to the sheet counts as one bill.

**Recent entries list** shows entries newest-first with type, item name, staff name, branch, time, payment method badge, and a link to the slip if one was uploaded.

---

## Switching language

Open **Settings**, scroll to the language selector, and tap a flag/label. The choice is saved on the device. Available languages: Lao, Thai, English, Vietnamese, Burmese.

---

## Installing as a PWA (mobile)

The app is a Progressive Web App and can be installed to your home screen so it opens full-screen like a native app.

**Android (Chrome):**
1. Open the app URL in Chrome.
2. Tap the browser menu (⋮) → **Add to Home screen** → **Install**.

**iOS (Safari):**
1. Open the app URL in Safari.
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.

Once installed, the app shell loads from cache when offline. Data operations (save entry, load dashboard) still require a network connection to reach the Apps Script backend.

> If the app doesn't reflect recent changes after installing, the service-worker cache may be stale. Ask your admin to bump the `CACHE` version in `service-worker.js` and redeploy.
