// 🔧 Spreadsheet & Sheet Config
// Deploy as: Execute as "Me", access "Anyone"
const SPREADSHEET_ID  = 'YOUR_GOOGLE_SHEET_ID_HERE';
const DRIVE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID_HERE';

// 📲 Telegram Bot Notification Config
const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_IDS  = ['YOUR_TELEGRAM_CHAT_ID_HERE'];

// 🔐 Google Sign-In — must match the frontend's GOOGLE_CLIENT_ID exactly,
// used to verify the 'aud' claim of incoming id_tokens
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID_HERE';

const TIMESTAMP_FORMAT = 'dd-MM-yyyy HH:mm:ss';

const ENTRY_HEADERS = ['Timestamp', 'Staff Name', 'Item Name', 'Currency',
                       'Price', 'Type', 'Shop', 'Payment Method', 'Slip URL', 'Transaction ID'];

function ss() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

// 🧹 Shared helpers
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }

// Return the named sheet tab, creating it (with a bold, frozen header row) if absent.
function getOrCreateSheet(name, headers) {
  const existing = ss().getSheetByName(name);
  if (existing) return existing;
  const sheet = ss().insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

// 🌐 GET Router — reads only; requires a valid app session token
function doGet(e) {
  try {
    const session = validateSession(e.parameter.sessionToken);
    if (!session) return respond({ error: 'AUTH_EXPIRED' });
    if (checkWhitelist(session.email) !== 'allow') return respond({ error: 'AUTH_DENIED' });

    const action = e.parameter.action;
    switch (action) {
      case 'getTodayData': return respond(getDateData(e.parameter.date || todayTab()));
      case 'getDateData':  return respond(getDateData(e.parameter.date));
      default:             return respond({ error: `Unknown GET action: ${action}` });
    }
  } catch (err) {
    return respond({ error: err.message });
  }
}

// 📬 POST Router — single combined payload (upload + row + Telegram)
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // 'authenticate' is the only action that runs before a session exists:
    // verify the one-time Google id_token, then mint an app session token.
    if (data.action === 'authenticate') {
      const auth = verifyGoogleToken(data.idToken);
      if (!auth) return respond({ error: 'AUTH_EXPIRED' });
      if (checkWhitelist(auth.email) !== 'allow') return respond({ error: 'AUTH_DENIED' });
      const sessionToken = getOrCreateSessionForDevice(
        auth.email, auth.name, data.deviceId, data.deviceLabel, data.userAgent, data.existingToken);
      return respond({ ok: true, sessionToken, name: auth.name, email: auth.email });
    }

    // Every other action requires a valid, non-expired app session token.
    const session = validateSession(data.sessionToken);
    if (!session) return respond({ error: 'AUTH_EXPIRED' });
    if (checkWhitelist(session.email) !== 'allow') return respond({ error: 'AUTH_DENIED' });
    data.userEmail = session.email; // verified identity from the session row — never client input
    data.staffName = session.name;  // verified identity from the session row — never client input

    switch (data.action) {
      case 'submitEntry': return respond(submitEntry(data));
      default:            return respond({ error: `Unknown POST action: ${data.action}` });
    }
  } catch (err) {
    return respond({ error: err.message });
  }
}

// 📦 JSON Response Envelope
function respond(obj) {
  const payload = Object.assign({ status: (obj && obj.error) ? 'error' : 'success' }, obj);
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// 📅 Today's Sheet-Tab Name
function todayTab() {
  return Utilities.formatDate(new Date(), ss().getSpreadsheetTimeZone(), 'dd-MM-yyyy');
}

// 🔐 Google id_token Verification
function verifyGoogleToken(idToken) {
  if (!idToken) return null;
  const resp = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (resp.getResponseCode() !== 200) return null;

  let payload;
  try {
    payload = JSON.parse(resp.getContentText());
  } catch (err) {
    return null;
  }

  if (payload.aud !== GOOGLE_CLIENT_ID) return null;
  if (payload.email_verified !== 'true' && payload.email_verified !== true) return null;
  if (!payload.email) return null;

  return { email: payload.email, name: payload.name || payload.email };
}

// ✅ Email Whitelist — sheet tab 'AllowedUsers': Email | Status | Note | Last Login
const WHITELIST_TAB     = 'AllowedUsers';
const WHITELIST_HEADERS = ['Email', 'Status', 'Note', 'Last Login'];

function checkWhitelist(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return 'deny';

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getOrCreateSheet(WHITELIST_TAB, WHITELIST_HEADERS);
    const rows  = sheet.getDataRange().getValues();
    const now   = Utilities.formatDate(new Date(), ss().getSpreadsheetTimeZone(), TIMESTAMP_FORMAT);

    for (let i = 1; i < rows.length; i++) {
      const rowEmail = normalizeEmail(rows[i][0]);
      if (rowEmail !== normalized) continue;
      const status = String(rows[i][1] || '').trim().toLowerCase();
      sheet.getRange(i + 1, 4).setValue(now);
      return status === 'allow' ? 'allow' : 'deny';
    }

    // Unknown email — auto-log as deny, storing the NORMALIZED email so a
    // repeat attempt matches this same row above instead of appending again
    sheet.appendRow([normalized, 'deny', 'Auto-logged on first access attempt', now]);
    return 'deny';
  } finally {
    lock.releaseLock();
  }
}

// 🪪 App-managed, device-bound sessions — sheet tab 'Sessions':
//   Token | Email | Name | DeviceId | DeviceLabel | UserAgent | Created | Expires
//   (0-based array indices: Token 0, Email 1, Name 2, DeviceId 3, DeviceLabel 4,
//    UserAgent 5, Created 6, Expires 7 → Expires is getRange column 8)
// After a one-time Google sign-in the backend mints its own token with a 30-day
// rolling expiry, bound to the signing-in device; the frontend then uses that token
// instead of the short-lived id_token. Re-login on the same device reuses the row.
const SESSION_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSIONS_TAB     = 'Sessions';
const SESSION_HEADERS  = ['Token', 'Email', 'Name', 'DeviceId', 'DeviceLabel', 'UserAgent', 'Created', 'Expires'];

// 0-based column indices into a Sessions row (keep in sync with SESSION_HEADERS)
const SES_TOKEN = 0, SES_EMAIL = 1, SES_NAME = 2, SES_DEVICE_ID = 3,
      SES_DEVICE_LABEL = 4, SES_UA = 5, SES_CREATED = 6, SES_EXPIRES = 7;

function getSessionsSheet() {
  return getOrCreateSheet(SESSIONS_TAB, SESSION_HEADERS);
}

function rowExpiry(row) {
  const v = row[SES_EXPIRES];
  return v instanceof Date ? v : new Date(v);
}

// Resolve the session token for a verified identity on a given device:
//   1) reuse the supplied existingToken IF its row belongs to this email (unlock path)
//   2) else reuse an existing non-expired row for this email + device
//   3) else mint a new row (new device)
// Reused rows have their device info refreshed and expiry rolled forward.
function getOrCreateSessionForDevice(email, name, deviceId, deviceLabel, userAgent, existingToken) {
  const normEmail = normalizeEmail(email);
  deviceId    = clampStr(deviceId, 100);
  deviceLabel = clampStr(deviceLabel, 200);
  userAgent   = clampStr(userAgent, 500);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSessionsSheet();
    purgeExpiredSessions(sheet);
    const rows      = sheet.getDataRange().getValues();
    const now       = new Date();
    const newExpiry = new Date(now.getTime() + SESSION_TTL_MS);

    // 1) Unlock path — reuse the presented token only if it OWNS this email.
    if (existingToken) {
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][SES_TOKEN]) !== String(existingToken)) continue;
        const expires = rowExpiry(rows[i]);
        // Ownership check: never reuse a token whose stored email differs from
        // the Google-verified identity (guards against a stolen token).
        if (normalizeEmail(rows[i][SES_EMAIL]) === normEmail &&
            !isNaN(expires.getTime()) && expires.getTime() > now.getTime()) {
          sheet.getRange(i + 1, SES_DEVICE_ID + 1, 1, 3)
               .setValues([[deviceId, deviceLabel, userAgent]]); // adopt current device
          sheet.getRange(i + 1, SES_EXPIRES + 1).setValue(newExpiry);
          return String(rows[i][SES_TOKEN]);
        }
        break; // token matched a row but failed ownership/expiry → don't reuse
      }
    }

    // 2) Same email + same device → reuse that row's token.
    if (deviceId) {
      for (let i = 1; i < rows.length; i++) {
        if (normalizeEmail(rows[i][SES_EMAIL]) !== normEmail) continue;
        if (String(rows[i][SES_DEVICE_ID]) !== String(deviceId)) continue;
        const expires = rowExpiry(rows[i]);
        if (isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) continue;
        sheet.getRange(i + 1, SES_DEVICE_LABEL + 1, 1, 2)
             .setValues([[deviceLabel, userAgent]]); // refresh label/UA
        sheet.getRange(i + 1, SES_EXPIRES + 1).setValue(newExpiry);
        return String(rows[i][SES_TOKEN]);
      }
    }

    // 3) New device → new row (token order matches SESSION_HEADERS).
    const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    sheet.appendRow([token, normEmail, name, deviceId, deviceLabel, userAgent, now, newExpiry]);
    return token;
  } finally {
    lock.releaseLock();
  }
}

function validateSession(token) {
  if (!token) return null;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSessionsSheet();
    const rows  = sheet.getDataRange().getValues();
    const now   = new Date();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][SES_TOKEN]) !== String(token)) continue;
      const expires = rowExpiry(rows[i]);
      if (isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) return null;
      // Roll the expiry forward so active users stay signed in
      sheet.getRange(i + 1, SES_EXPIRES + 1).setValue(new Date(now.getTime() + SESSION_TTL_MS));
      return { email: String(rows[i][SES_EMAIL] || ''), name: String(rows[i][SES_NAME] || '') };
    }
    return null;
  } finally {
    lock.releaseLock();
  }
}

// Delete expired/invalid session rows (bottom-up so indices stay valid).
// Called from getOrCreateSessionForDevice only, to keep validateSession fast.
function purgeExpiredSessions(sheet) {
  const rows = sheet.getDataRange().getValues();
  const now  = new Date().getTime();
  for (let i = rows.length - 1; i >= 1; i--) {
    const expires = rowExpiry(rows[i]);
    if (isNaN(expires.getTime()) || expires.getTime() <= now) {
      sheet.deleteRow(i + 1);
    }
  }
}

// 🛡️ Defensive input normalization — no-op for well-formed app submissions
function clampStr(s, max) {
  s = String(s == null ? '' : s);
  return s.length > max ? s.slice(0, max) : s;
}

// 📝 Entry Submission — upload slip, append row, notify Telegram
function submitEntry(data) {
  data.itemName  = clampStr(data.itemName, 200);
  data.staffName = clampStr(data.staffName, 200);
  data.shop      = clampStr(data.shop, 200);
  data.type      = data.type === 'Income' ? 'Income' : 'Expense';
  data.currency  = clampStr(data.currency, 10);

  // Step 1: upload slip image to Drive (if provided)
  let fileUrl = '';
  if (data.fileData) {
    fileUrl = uploadSlipToDrive(data.fileName, data.fileData, data.mimeType);
  }

  // Step 2: append one row per currency sub-amount (locked to avoid concurrent-write races)
  const tab = data.sheetTabName;
  const amounts = Array.isArray(data.amounts) && data.amounts.length
    ? data.amounts
    : [{ currency: data.currency, price: data.price }];
  amounts.forEach(a => { a.currency = clampStr(a.currency, 10); });
  const transactionId = Utilities.getUuid();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = ss().getSheetByName(tab) || createDailySheet(tab);
    amounts.forEach(amount => {
      if (amount.paymentMethod === 'Split') {
        // One Split line → two rows so dashboard cash/online totals stay accurate
        sheet.appendRow([data.timestamp, data.staffName, data.itemName,
          amount.currency, Number(amount.splitCash) || 0,
          data.type, data.shop, 'Cash', fileUrl, transactionId]);
        sheet.appendRow([data.timestamp, data.staffName, data.itemName,
          amount.currency, Number(amount.splitOnline) || 0,
          data.type, data.shop, 'Online Payment', fileUrl, transactionId]);
      } else {
        sheet.appendRow([
          data.timestamp, data.staffName, data.itemName,
          amount.currency, Number(amount.price) || 0,
          data.type, data.shop,
          amount.paymentMethod || data.paymentMethod,
          fileUrl, transactionId,
        ]);
      }
    });
  } finally {
    lock.releaseLock();
  }

  // Step 3: fire the Telegram notification from the server side
  // Expand Split amounts into two rows to match what was written to the sheet
  const telegramAmounts = [];
  amounts.forEach(a => {
    if (a.paymentMethod === 'Split') {
      telegramAmounts.push({ currency: a.currency, price: Number(a.splitCash)  || 0, paymentMethod: 'Cash' });
      telegramAmounts.push({ currency: a.currency, price: Number(a.splitOnline) || 0, paymentMethod: 'Online Payment' });
    } else {
      telegramAmounts.push(a);
    }
  });
  let telegramOk = false;
  let telegramError = '';
  try {
    const tgResult = sendTelegramNotification(data, fileUrl, telegramAmounts);
    telegramOk = tgResult.ok;
    telegramError = tgResult.error;
  } catch (err) {
    telegramError = err.message;
  }

  return { success: true, url: fileUrl, telegramOk, telegramError };
}

function createDailySheet(tab) {
  const sheet = ss().insertSheet(tab);
  const hdr   = sheet.getRange(1, 1, 1, ENTRY_HEADERS.length);
  hdr.setValues([ENTRY_HEADERS])
     .setFontWeight('bold')
     .setBackground('#0E1526')
     .setFontColor('#2EE8B4');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, ENTRY_HEADERS.length, 150);
  sheet.setColumnWidth(1, 175);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(9, 220);
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  return sheet;
}

// 📊 Daily Entries Lookup
function getDateData(dateTab) {
  const book  = ss();
  const sheet = book.getSheetByName(dateTab);
  if (!sheet) return { entries: [], tabName: dateTab };

  const tz   = book.getSpreadsheetTimeZone();
  const rows = sheet.getDataRange().getValues();
  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    entries.push({
      timestamp:     normalizeTimestamp(rows[i][0], tz),
      staffName:     String(rows[i][1] || ''),
      itemName:      String(rows[i][2] || ''),
      currency:      String(rows[i][3] || 'LAK'),
      price:         Number(rows[i][4]) || 0,
      type:          String(rows[i][5] || ''),
      shop:          String(rows[i][6] || ''),
      paymentMethod: String(rows[i][7] || ''),
      slipUrl:       String(rows[i][8] || ''),
      transactionId: String(rows[i][9] || ''),
    });
  }
  return { entries, tabName: dateTab };
}

function normalizeTimestamp(value, timeZone) {
  if (value instanceof Date) return Utilities.formatDate(value, timeZone, TIMESTAMP_FORMAT);
  return String(value || '');
}

// 📤 Slip Upload to Drive
const ALLOWED_SLIP_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SLIP_BYTES = 5 * 1024 * 1024;

function uploadSlipToDrive(fileName, fileDataBase64, mimeType) {
  if (ALLOWED_SLIP_MIME_TYPES.indexOf(mimeType) === -1) {
    throw new Error('Invalid file type');
  }
  const decoded = Utilities.base64Decode(fileDataBase64);
  if (decoded.length > MAX_SLIP_BYTES) {
    throw new Error('File too large');
  }
  const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const blob   = Utilities.newBlob(decoded, mimeType, fileName || 'slip.jpg');
  const file   = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return `https://drive.google.com/file/d/${file.getId()}/view`;
}

// 🔒 Escape user-supplied text for Telegram HTML parse_mode
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// 📲 Telegram Bot Notification — fired server-side only, never from the client
function sendTelegramNotification(data, fileUrl, amounts) {
  const costLines = (amounts || [{ currency: data.currency, price: data.price }])
    .map(a => a.paymentMethod === 'Split'
      ? `(Cash: ${escapeHtml(a.splitCash)} / Online: ${escapeHtml(a.splitOnline)}) ${escapeHtml(a.currency)}`
      : `${escapeHtml(a.price)} ${escapeHtml(a.currency)}`)
    .join('\n');

  const lines = [
    data.type === 'Income' ? '🟢 <b>New Income</b>' : '🔴 <b>New Expense</b>',
    `<b>Item Name:</b> ${escapeHtml(data.itemName)}`,
    `<b>Cost:</b>\n${costLines}`,
    `<b>Payment Method:</b> ${escapeHtml(data.paymentMethod)}`,
    `<b>Branch:</b> ${escapeHtml(data.shop)}`,
    `<b>Author:</b> ${escapeHtml(data.userEmail || data.staffName)}`,
  ];
  if (fileUrl) lines.push(`<b>Slip:</b> <a href="${escapeHtml(fileUrl)}">View Attachment</a>`);

  const url  = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
  const text = lines.join('\n');

  const errors = [];
  let sentAny = false;
  TELEGRAM_CHAT_IDS.forEach(chatId => {
    if (!chatId || chatId === 'YOUR_TELEGRAM_CHAT_ID_HERE') return;
    sentAny = true;
    const options = {
      method:             'post',
      contentType:        'application/json',
      payload:            JSON.stringify({
        chat_id:    chatId,
        text:       text,
        parse_mode: 'HTML',
      }),
      muteHttpExceptions: true,
    };
    const resp = UrlFetchApp.fetch(url, options);
    const code = resp.getResponseCode();
    if (code !== 200) errors.push(`${chatId}: HTTP ${code}: ${resp.getContentText()}`);
  });

  return { ok: sentAny && errors.length === 0, error: errors.join('; ') };
}
