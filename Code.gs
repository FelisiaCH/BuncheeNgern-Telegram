// 🔧 Spreadsheet & Sheet Config
// Deploy as: Execute as "User accessing the web app", access "Anyone with Google account"
const SPREADSHEET_ID  = 'YOUR_GOOGLE_SHEET_ID_HERE';
const DRIVE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID_HERE';

// 📲 Telegram Bot Notification Config
const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID   = 'YOUR_TELEGRAM_CHAT_ID_HERE';

const TIMESTAMP_FORMAT = 'dd-MM-yyyy HH:mm:ss';

const ENTRY_HEADERS = ['Timestamp', 'Staff Name', 'Item Name', 'Currency',
                       'Price', 'Type', 'Shop', 'Payment Method', 'Slip URL'];

function ss() { return SpreadsheetApp.openById(SPREADSHEET_ID); }

// 🌐 GET / POST Router
function doGet(e) {
  try {
    const action = e.parameter.action;
    switch (action) {
      case 'getUsers':     return respond(getUsers());
      case 'getTodayData': return respond(getDateData(e.parameter.date || todayTab()));
      case 'getDateData':  return respond(getDateData(e.parameter.date));
      default:             return respond({ error: `Unknown GET action: ${action}` });
    }
  } catch (err) {
    return respond({ error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    switch (data.action) {
      case 'validateUser': return respond(validateUser(data.staffName, data.pin));
      case 'lockUser':     return respond(lockUser(data.staffName));
      case 'submitEntry':  return respond(submitEntry(data));
      case 'uploadFile':   return respond(uploadFile(data.fileName, data.fileData, data.mimeType));
      default:             return respond({ error: `Unknown POST action: ${data.action}` });
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

// 👤 User Lookup & Authentication
function getUsers() {
  const sheet = ss().getSheetByName('Users');
  if (!sheet) return { error: "'Users' tab not found in spreadsheet" };

  const rows  = sheet.getDataRange().getValues();
  const users = [];
  for (let i = 1; i < rows.length; i++) {
    const name = String(rows[i][0] || '').trim();
    if (!name) continue;
    users.push({ staffName: name, status: String(rows[i][2] || 'Active').trim() });
  }
  return { users };
}

function validateUser(staffName, pin) {
  const sheet = ss().getSheetByName('Users');
  if (!sheet) return { success: false, error: 'Users sheet missing' };

  const name = String(staffName || '').trim();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() !== name) continue;
    if (String(rows[i][2]).trim() === 'Locked') return { success: false, locked: true };
    if (String(rows[i][1]).trim() === String(pin || '').trim()) return { success: true };
    return { success: false, locked: false };
  }
  return { success: false, locked: false };
}

function lockUser(staffName) {
  const sheet = ss().getSheetByName('Users');
  if (!sheet) return { success: false, error: 'Users sheet missing' };

  const name = String(staffName || '').trim();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === name) {
      sheet.getRange(i + 1, 3).setValue('Locked');
      return { success: true };
    }
  }
  return { success: false, error: 'User not found' };
}

// 📝 Entry Submission & Sheet Setup
function submitEntry(data) {
  const tab   = data.sheetTabName;
  const sheet = ss().getSheetByName(tab) || createDailySheet(tab);

  const row = [
    data.timestamp,
    data.staffName,
    data.itemName,
    data.currency,
    Number(data.price) || 0,
    data.type,
    data.shop,
    data.paymentMethod,
    data.slipUrl || '',
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);

  try {
    const message = '🔔 มีรายการใหม่เข้ามา!\n👤 ผู้บันทึก: ' + data.staffName +
      '\n💸 รายการ: ' + data.itemName + ' [' + data.shop + ']' +
      '\n💰 ยอดเงิน: ' + data.price + ' ' + data.currency;
    sendTelegramNotification(message);
  } catch (err) {}

  return { success: true };
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
    });
  }
  return { entries, tabName: dateTab };
}

function normalizeTimestamp(value, timeZone) {
  if (value instanceof Date) return Utilities.formatDate(value, timeZone, TIMESTAMP_FORMAT);
  return String(value || '');
}

// 📤 Slip Upload to Drive
function uploadFile(fileName, fileDataBase64, mimeType) {
  try {
    const folder  = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const decoded = Utilities.base64Decode(fileDataBase64);
    const blob    = Utilities.newBlob(decoded, mimeType || 'image/jpeg', fileName);
    const file    = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { success: true, url: `https://drive.google.com/file/d/${file.getId()}/view` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// 📲 Telegram Bot Notification Delivery
function sendTelegramNotification(message) {
  const url = 'https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage';
  const options = {
    method:             'post',
    contentType:        'application/json',
    payload:            JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message }),
    muteHttpExceptions: true,
  };

  UrlFetchApp.fetch(url, options);
}
