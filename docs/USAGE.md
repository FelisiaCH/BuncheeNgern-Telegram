# Buncheengern — Usage Guide

Day-to-day guide for staff using the app after a fork has been set up. For initial setup (Apps Script, OAuth, hosting), see the [README](../README.md).

---

## Signing in / access

You sign in with your Google account. That's only the first step — every sign-in is checked against an allow-list maintained by your admin, so having a Google account alone doesn't grant access.

If you sign in and see a message saying your account isn't authorized, that's expected the first time: your admin needs to add your email to the allow-list (or flip it from "deny" to "allow") before you can use the app. Let them know which Google account you signed in with, and try again once they've confirmed it's been added.

After you sign in once, you stay signed in **on that device** — you won't be asked to sign in every time. A session lasts about a month, and every time you use the app the clock resets, so in practice you rarely have to sign in again. The same Google account can be signed in on several devices at once, each staying signed in independently.

There are two ways to sign out, both in the app:

- **Lock** — the lock button in the top-right corner quickly locks the app without forgetting you. To get back in, sign in with Google again; because your device still remembers the session, it unlocks right away (the app just re-confirms it's really you).
- **Sign out & forget this device** — under **Settings ▸ Account**. This fully signs you out and clears the saved session from this device. Use it on a shared or borrowed device so the next person can't get back into your account.

If you ever do see a "session expired" message — for example after about a month of not using the app, or if your admin removed your session — just sign in with Google again.

---

## First run: add currencies

The currency list starts **empty**. Before you can log anything, open **Settings ▸ Manage Currencies** and add at least one entry using the search picker:

1. Type into the search box — it matches against currency **code**, **name**, or **country** (e.g. typing `thai`, `th`, or `thailand` all find Thai Baht).
2. Browse the results, grouped by region (Asia, Europe, Americas, Middle East & Africa, Oceania, Crypto).
3. Tap a currency to add it. Currencies already added are marked and can't be added twice.

Repeat for every currency your operation uses. The app blocks submission with a warning until at least one currency exists.

> Removing a currency later does **not** delete past entries — they still appear on the dashboard. The currency tab for it will continue to show as long as that day's data contains it.

---

## Logging an entry

1. Open the **Record** tab (pencil icon, bottom nav).
2. Choose **Income** or **Expense**.
3. Type or select an **item name** — previously used names appear in a dropdown as you type.
4. Choose a **currency** from the selector and enter the **amount**.
5. Select the **branch** (chip buttons below the amount row).
6. Choose the **payment method**: **Cash**, **Online Payment**, or **Split**.
7. Tap **Save Entry**.

On success a toast confirms the save. If the Telegram notification failed separately, a second toast says so (the entry is still saved).

### Attaching a slip

When the payment method is **Online Payment** or **Split**, an upload zone appears below the payment method row. Tap it, drag-and-drop a photo, or tap the **📷** in the top-right corner of the zone to shoot one with the camera:

- Maximum file size before compression: **5 MB**.
- The browser automatically resizes the image to at most **1280 px** on its longest side and re-encodes it as JPEG at **~82% quality** before uploading, so the actual upload is smaller.
- After attaching, a preview appears. Tap **✕ Remove Slip** to clear it.
- A slip is **required** when the payment method is **Online Payment** or **Split**; submission is blocked without one.

---

## Multiple currencies in one transaction

To record a bill that spans several currencies (e.g. part paid in LAK, part in THB), use a **Split** payment:

1. Set the **payment method** to **Split**.
2. Fill in the amount(s) for the first currency in the split builder.
3. Tap **＋ Add currency** to add another currency, then enter its amount(s).
4. Add as many currencies as needed.
5. Tap **Save Entry**.

Each active part is saved as a separate row in the sheet, but all rows from one submission share the same **Transaction ID** so they can be grouped later. The dashboard entry count shows **bills** (distinct Transaction IDs), not rows — so a multi-currency transaction counts as one entry.

---

## Split payment

The payment method has three options: **Cash**, **Online Payment**, or **Split**.

Choosing **Split** opens the split builder. Each currency in the split has two toggle chips — **Cash** (💵) and **Online** (📱). Turn on either or both; each one you turn on reveals an amount field, and the currency's subtotal updates live as you type. There's no separate total to match — the bill total is derived from the parts you enter. To split across currencies, tap **＋ Add currency**; to drop a currency, use the **❌** on its group. At least one amount must be turned on.

A slip is required whenever the payment method is **Online Payment** or **Split**.

A Split is saved as **one row per active part** in the sheet — e.g. a Cash + Online split in a single currency writes two rows (one `Cash`, one `Online Payment`); adding a second currency adds more. Every row shares the same Transaction ID as the rest of the bill, so the dashboard counts Cash Income and Online Payment Income separately and correctly without any manual splitting.

The bill count in the Summary tab still shows as one entry (same Transaction ID).

---

## Managing currencies

**Settings ▸ Manage Currencies** (scroll down in the Settings tab):

- **Add:** use the search picker — type a code, name, or country to filter the region-grouped list (~85 world currencies plus popular crypto), then tap a result to add it. Currencies already added are marked and tapping them again does nothing.
- **Remove:** tap ❌ next to any currency in the added list and confirm. Past entries using it are kept and still show on the dashboard.
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
- **Online Payment Income** — sum of Income entries paid by Online Payment (including the Online Payment portion of Split lines).
- **Total Expenses** — sum of all Expense entries.

**Entry count badge** (top-right of the Summary tab) counts **distinct bills**, not rows. A split transaction that writes several rows to the sheet counts as one bill.

**Recent entries list** shows entries newest-first with type, item name, staff name, branch, time, payment method badge, and a link to the slip if one was uploaded.

---

## Switching language

On first launch, the app automatically picks your device's language if it's one of the supported ones; otherwise it falls back to English.

To change it yourself, open **Settings** and use the searchable language picker — type part of a language's name or its code to filter, then tap to switch. The choice is saved on the device. 18 languages are available.

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
