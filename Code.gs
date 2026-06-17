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

// 🌐 GET Router
function doGet(e) {
  try {
    const auth = verifyGoogleToken(e.parameter.idToken);
    if (!auth) return respond({ error: 'AUTH_EXPIRED' });
    if (checkWhitelist(auth.email) !== 'allow') return respond({ error: 'AUTH_DENIED' });

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

    const auth = verifyGoogleToken(data.idToken);
    if (!auth) return respond({ error: 'AUTH_EXPIRED' });
    if (checkWhitelist(auth.email) !== 'allow') return respond({ error: 'AUTH_DENIED' });
    data.userEmail = auth.email; // verified identity — discard any client-supplied value
    data.staffName = auth.name;  // verified identity — discard any client-supplied value

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

function createWhitelistSheet() {
  const sheet = ss().insertSheet(WHITELIST_TAB);
  sheet.getRange(1, 1, 1, WHITELIST_HEADERS.length)
       .setValues([WHITELIST_HEADERS])
       .setFontWeight('bold');
  sheet.setFrozenRows(1);
  return sheet;
}

function checkWhitelist(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return 'deny';

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = ss().getSheetByName(WHITELIST_TAB) || createWhitelistSheet();
    const rows  = sheet.getDataRange().getValues();
    const now   = Utilities.formatDate(new Date(), ss().getSpreadsheetTimeZone(), TIMESTAMP_FORMAT);

    for (let i = 1; i < rows.length; i++) {
      const rowEmail = String(rows[i][0] || '').trim().toLowerCase();
      if (rowEmail !== normalized) continue;
      const status = String(rows[i][1] || '').trim().toLowerCase();
      if (status === 'allow') {
        sheet.getRange(i + 1, 4).setValue(now);
        return 'allow';
      }
      return 'deny';
    }

    // Unknown email — auto-log as deny; owner promotes to 'allow' manually
    sheet.appendRow([email, 'deny', 'Auto-logged on first access attempt', now]);
    return 'deny';
  } finally {
    lock.releaseLock();
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
