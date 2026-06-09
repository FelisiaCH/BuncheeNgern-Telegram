// 🔧 Spreadsheet & Sheet Config
const SPREADSHEET_ID  = 'YOUR_GOOGLE_SHEET_ID_HERE';
const DRIVE_FOLDER_ID = 'YOUR_DRIVE_FOLDER_ID_HERE';

// 📡 VAPID credentials for Web Push  ─────────────────────────────────────────
// PUSH_VAPID_PUBLIC must exactly match VAPID_PUBLIC_KEY in index.html.
// PUSH_VAPID_PRIVATE is the secret counterpart generated at project setup;
//   see the project README or your local key-generation notes for its value.
//   ⚠️  Never commit the real private key to a public repository.
const PUSH_VAPID_PUBLIC  = 'YOUR_VAPID_PUBLIC_KEY_HERE';
const PUSH_VAPID_PRIVATE = 'YOUR_VAPID_PRIVATE_KEY_HERE';
const PUSH_VAPID_SUBJECT = 'mailto:your-email@example.com';

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
      case 'validateUser':        return respond(validateUser(data.staffName, data.pin));
      case 'lockUser':            return respond(lockUser(data.staffName));
      case 'submitEntry':         return respond(submitEntry(data));
      case 'uploadFile':          return respond(uploadFile(data.fileName, data.fileData, data.mimeType));
      case 'savePushSubscription': return respond(savePushSubscription_(data.subscription));
      default:                    return respond({ error: `Unknown POST action: ${data.action}` });
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

// ════════════════════════════════════════════════════════════════════════════
// 📡 Web Push Notification Engine
//
// Requirements:
//   • Apps Script runtime must be set to V8 (Project Settings → Runtime → V8).
//     The P-256 math below uses BigInt, which requires V8.
//   • Set PUSH_VAPID_PRIVATE at the top of this file to your real private key.
//   • Set PUSH_VAPID_SUBJECT to your contact e-mail (required by the VAPID spec).
//
// How the full flow works:
//   1. User opens FinTrack → taps "Subscribe" in More Options → browser creates
//      a PushSubscription object (endpoint + crypto keys).
//   2. Frontend calls this script via doPost with action:'savePushSubscription'.
//      OR the staff copies the JSON token and you paste it into Sheets manually.
//   3. On every new transaction row, the onNewTransaction() trigger fires and
//      calls sendWebPushNotification() for every stored subscription.
//   4. This function signs a VAPID JWT (ES256 / ECDSA P-256) and POSTs the
//      notification payload to the browser's push service (FCM, Mozilla, etc.)
//      using UrlFetchApp — no third-party libraries or cloud services needed.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Send a Web Push notification to one subscribed device.
 *
 * @param {string} title              Notification title shown on the device.
 * @param {string} body               Notification body text.
 * @param {string} targetEndpointJson PushSubscription JSON string — copy from
 *                                    the "📡 Web Push Subscription" panel in FinTrack.
 *
 * Usage example (run from the Script Editor to test manually):
 *   sendWebPushNotification(
 *     'FinTrack — สาขา 1',
 *     'มีรายการใหม่เข้าสาขา 1 ยอดเงิน 500 บาท',
 *     '{"endpoint":"https://fcm.googleapis.com/...","keys":{...}}'
 *   );
 */
function sendWebPushNotification(title, body, targetEndpointJson) {
  let sub;
  try { sub = JSON.parse(targetEndpointJson); }
  catch (e) { Logger.log('[WebPush] ERROR — invalid subscription JSON: ' + e.message); return; }

  const endpoint = sub && sub.endpoint;
  if (!endpoint) { Logger.log('[WebPush] ERROR — subscription has no endpoint'); return; }

  // VAPID JWT: proves to the push service that we own the public key in index.html
  const origin = endpoint.match(/^(https?:\/\/[^/]+)/)[1];
  const claims = {
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 43200, // valid for 12 hours
    sub: PUSH_VAPID_SUBJECT,
  };

  let jwt;
  try { jwt = _buildVapidJwt_(claims); }
  catch (e) { Logger.log('[WebPush] JWT signing failed: ' + e.message); return; }

  const options = {
    method:  'post',
    headers: {
      // VAPID auth: JWT + raw public key, comma-separated
      'Authorization': 'vapid t=' + jwt + ',k=' + PUSH_VAPID_PUBLIC,
      'Content-Type':  'application/json',
      // TTL: push service caches the message for up to this many seconds
      // if the device is offline. 0 = deliver now or discard.
      'TTL':           '86400',
    },
    payload:            JSON.stringify({ title: title, body: body }),
    muteHttpExceptions: true,
  };

  try {
    const res  = UrlFetchApp.fetch(endpoint, options);
    const code = res.getResponseCode();
    if (code >= 400) {
      Logger.log('[WebPush] ' + code + ' ERROR — ' + res.getContentText().slice(0, 200));
    } else {
      Logger.log('[WebPush] ' + code + ' OK — delivered to ' + endpoint.slice(0, 60) + '…');
    }
  } catch (e) {
    Logger.log('[WebPush] Fetch error: ' + e.message);
  }
}

// ── Subscription Storage ─────────────────────────────────────────────────────

/**
 * Called by doPost when action === 'savePushSubscription'.
 * Stores (or updates) a device subscription in the "PushSubscriptions" sheet.
 * Each row: [ endpoint, subscriptionJson, savedAt ]
 */
function savePushSubscription_(subscriptionJson) {
  if (!subscriptionJson) return { success: false, error: 'Empty subscription' };

  let sub;
  try { sub = JSON.parse(subscriptionJson); }
  catch (e) { return { success: false, error: 'Invalid JSON: ' + e.message }; }

  const book  = ss();
  let sheet   = book.getSheetByName('PushSubscriptions');
  if (!sheet) {
    sheet = book.insertSheet('PushSubscriptions');
    sheet.appendRow(['endpoint', 'subscriptionJson', 'savedAt']);
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, 3, 320);
  }

  const now  = new Date().toISOString();
  const data = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues()
    : [];

  // Upsert: replace existing row if endpoint already present
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === sub.endpoint) {
      sheet.getRange(i + 2, 2, 1, 2).setValues([[subscriptionJson, now]]);
      return { success: true, updated: true };
    }
  }

  sheet.appendRow([sub.endpoint, subscriptionJson, now]);
  return { success: true, updated: false };
}

/** Returns all stored subscription JSON strings from the PushSubscriptions sheet. */
function loadPushSubscriptions_() {
  const sheet = ss().getSheetByName('PushSubscriptions');
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 2, sheet.getLastRow() - 1, 1)
              .getValues()
              .map(r => r[0])
              .filter(Boolean);
}

// ── Trigger: fire on every new transaction row ───────────────────────────────

/**
 * Installable trigger — fires when a row is appended to any sheet.
 *
 * HOW TO INSTALL:
 *   Apps Script editor → ⏱ Triggers (left sidebar) → "+ Add Trigger"
 *     Function:    onNewTransaction
 *     Event source: From spreadsheet
 *     Event type:   On change
 *   Save. Google will ask you to authorize the script.
 *
 * The trigger receives an event object. We only act on INSERT_ROW changes.
 */
function onNewTransaction(e) {
  if (!e || e.changeType !== 'INSERT_ROW') return;

  // Read the row that was just appended
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const last  = sheet.getLastRow();
  if (last < 2) return; // sheet has only a header row

  // Column order matches ENTRY_HEADERS:
  //   0=Timestamp  1=StaffName  2=ItemName  3=Currency
  //   4=Price      5=Type       6=Shop      7=PaymentMethod  8=SlipUrl
  const row      = sheet.getRange(last, 1, 1, sheet.getLastColumn()).getValues()[0];
  const staff    = String(row[1] || '');
  const itemName = String(row[2] || '');
  const currency = String(row[3] || 'LAK');
  const price    = Number(row[4]) || 0;
  const type     = String(row[5] || '').toLowerCase();
  const shop     = String(row[6] || '');

  const isIncome = type.includes('income');
  const sign     = isIncome ? '+' : '-';
  const title    = 'FinTrack — ' + shop;
  const body     = `${staff}: ${sign}${price.toLocaleString()} ${currency} (${itemName})`;

  const subscriptions = loadPushSubscriptions_();
  if (subscriptions.length === 0) {
    Logger.log('[WebPush] No subscriptions stored — skipping push');
    return;
  }

  subscriptions.forEach(json => {
    try { sendWebPushNotification(title, body, json); }
    catch (err) { Logger.log('[WebPush] Failed for one subscription: ' + err.message); }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 🔐 VAPID JWT Signing — ECDSA P-256 (ES256), pure Apps Script / V8 BigInt
//
// No external libraries. Implements:
//   • RFC 7519  JWT structure
//   • RFC 8292  VAPID application server identification
//   • RFC 6979  Deterministic ECDSA nonce (no random number needed)
//   • SEC 1 / FIPS 186-4  P-256 elliptic curve arithmetic
// ════════════════════════════════════════════════════════════════════════════

/** Builds and returns a signed VAPID JWT string. */
function _buildVapidJwt_(claims) {
  const ub      = b => b & 0xff;
  const b64u    = bytes => Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
  const strBytes = s => Array.from(Utilities.newBlob(s, 'UTF-8').getBytes()).map(ub);

  const header  = b64u(strBytes(JSON.stringify({ alg: 'ES256', typ: 'JWT' })));
  const payload = b64u(strBytes(JSON.stringify(claims)));
  const input   = header + '.' + payload;
  const sig     = _ecdsaSign_(strBytes(input), PUSH_VAPID_PRIVATE);
  return input + '.' + b64u(sig);
}

/**
 * ECDSA P-256 sign.
 * @param {number[]} msgBytes  UTF-8 bytes of the JWT header.payload string.
 * @param {string}   privB64u  VAPID private key as base64url (32 bytes).
 * @returns {number[]} 64-byte signature (r || s, each 32 bytes big-endian).
 */
function _ecdsaSign_(msgBytes, privB64u) {
  const ub = b => b & 0xff;

  // Decode private key
  const pad      = '='.repeat((4 - privB64u.length % 4) % 4);
  const privBytes = Array.from(
    Utilities.base64Decode((privB64u + pad).replace(/-/g, '+').replace(/_/g, '/'))
  ).map(ub);
  const priv = _bytesToBigInt_(privBytes);

  // SHA-256 hash of the signing input
  const hashBytes = Array.from(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, msgBytes)
  ).map(ub);
  const z = _bytesToBigInt_(hashBytes);

  // Deterministic nonce k (RFC 6979)
  const k = _rfc6979k_(privBytes, hashBytes);

  // ECDSA: (r, s) = sign(z, priv, k)
  const [rx] = _ecMul_(k, [_P256_Gx, _P256_Gy]);
  const r    = _modN_(rx);
  const s    = _modN_(_invN_(k) * (z + r * priv));

  return [..._bigIntToBytes32_(r), ..._bigIntToBytes32_(s)];
}

// ── RFC 6979: deterministic nonce generation ─────────────────────────────────

function _rfc6979k_(privBytes, hashBytes) {
  const ub   = b => b & 0xff;
  const hmac = (key, ...parts) => {
    const msg = [].concat(...parts);
    return Array.from(Utilities.computeHmacSha256Signature(msg, key)).map(ub);
  };

  let V = Array(32).fill(0x01);
  let K = Array(32).fill(0x00);

  K = hmac(K, V, [0x00], privBytes, hashBytes);
  V = hmac(K, V);
  K = hmac(K, V, [0x01], privBytes, hashBytes);
  V = hmac(K, V);

  for (;;) {
    V = hmac(K, V);
    const candidate = _bytesToBigInt_(V);
    if (candidate >= _BI1 && candidate < _P256_N) return candidate;
    K = hmac(K, V, [0x00]);
    V = hmac(K, V);
  }
}

// ── P-256 curve parameters ───────────────────────────────────────────────────
// BigInt literals (e.g. 1n) are not parsed by Apps Script V8; use BigInt() instead.

const _P256_P  = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
const _P256_N  = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
const _P256_Gx = BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
const _P256_Gy = BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
const _BI0 = BigInt(0);
const _BI1 = BigInt(1);
const _BI2 = BigInt(2);
const _BI3 = BigInt(3);

// ── Modular arithmetic helpers ───────────────────────────────────────────────

function _modP_(n) { return ((n % _P256_P) + _P256_P) % _P256_P; }
function _modN_(n) { return ((n % _P256_N) + _P256_N) % _P256_N; }

// Modular exponentiation — used for modular inverse (Fermat: a^(p-2) mod p)
function _powMod_(base, exp, mod) {
  let r = _BI1;
  let b = ((base % mod) + mod) % mod;
  while (exp > _BI0) {
    if (exp & _BI1) r = r * b % mod;
    b = b * b % mod;
    exp >>= _BI1;
  }
  return r;
}

function _invP_(a) { return _powMod_(a, _P256_P - _BI2, _P256_P); }
function _invN_(a) { return _powMod_(a, _P256_N - _BI2, _P256_N); }

// ── Elliptic curve point operations ─────────────────────────────────────────

/** Point addition on P-256. Returns null for the point at infinity. */
function _ecAdd_(P1, P2) {
  if (!P1) return P2;
  if (!P2) return P1;
  const [x1, y1] = P1;
  const [x2, y2] = P2;
  if (x1 === x2) {
    if (y1 !== y2) return null; // P + (-P) = infinity
    // Point doubling
    const lam = _modP_(_BI3 * x1 * x1 * _invP_(_BI2 * y1));
    const x3  = _modP_(lam * lam - _BI2 * x1);
    return [x3, _modP_(lam * (x1 - x3) - y1)];
  }
  // Point addition
  const lam = _modP_((y2 - y1) * _invP_(x2 - x1));
  const x3  = _modP_(lam * lam - x1 - x2);
  return [x3, _modP_(lam * (x1 - x3) - y1)];
}

/** Scalar multiplication: returns k * P on P-256. */
function _ecMul_(k, P) {
  let R = null;
  let Q = P;
  while (k > _BI0) {
    if (k & _BI1) R = _ecAdd_(R, Q);
    Q = _ecAdd_(Q, Q);
    k >>= _BI1;
  }
  return R;
}

// ── Byte / BigInt conversion helpers ────────────────────────────────────────

function _bytesToBigInt_(bytes) {
  return BigInt('0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join(''));
}

function _bigIntToBytes32_(n) {
  const hex = n.toString(16).padStart(64, '0');
  const out = [];
  for (let i = 0; i < 64; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}
