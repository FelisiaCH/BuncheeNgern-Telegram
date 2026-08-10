// bcn-api — Cloudflare Worker read-through cache + rate shield in front of
// the Apps Script backend. Per bcn-backend-b0-worker-cache.md (B0).
//
// Sheets stays source of truth. This Worker holds NO durable state Apps
// Script doesn't also have — every KV/Cache entry is a disposable copy
// that can be wiped or ignored at any moment with zero data loss.
// Reversible in one line: point the client's endpoint constant back at
// SCRIPT_URL and this Worker is out of the loop entirely.
//
// ── Design notes — deviations from a literal reading of the task doc ──────
//
// 1. Cache key is per-DAY (`day:{dd-MM-yyyy}`), not per-action-and-range.
//    Code.gs's getRangeData/getDateData take no branch parameter at all —
//    branch filtering happens client-side (confirmed: v2/js/dashboard.js's
//    only getRangeData call sends {action, startDate, endDate}, nothing
//    else). So "key by action + branch + date-range" as literally written
//    doesn't map onto a real request shape. A per-day key does two things
//    a per-range key can't: (a) getRangeData decomposes into N per-day
//    lookups, so it shares one cache namespace with getDateData/
//    getTodayData — a day fetched via one action is a hit via any of the
//    others; (b) write invalidation becomes exact. submitEntry writes to
//    exactly one known tab (data.sheetTabName, client-supplied — the
//    Split→two-row path still writes N rows to that SAME one tab), so
//    invalidating that one day-key is always correct by construction,
//    never a guess about which range(s) might contain it.
//
// 2. getTodayData is treated as cacheable, even though the doc's router
//    line only names getRangeData|getDateData. Code.gs's doGet calls the
//    exact same getDateData() for both actions (getTodayData is just
//    getDateData with a date fallback) and v1 uses getTodayData
//    exclusively for "today" (v2 uses getRangeData for everything,
//    including today). Leaving it pass-through-only would silently leave
//    v1 — the live production app — uncached for its hottest, most
//    latency-sensitive request. Both v1 and v2 always send an explicit
//    `date` param on this action (checked: js/dashboard.js always passes
//    `date: tab`), so the Worker never has to guess "today" itself —
//    it just reads whatever date the caller already computed.
//
// 3. Auth trade-off (the one judgment call the doc left open — read this
//    before changing TTLs). Every Apps Script call, cached or not,
//    normally re-validates the session + whitelist per request. A cache
//    hit, by definition, returns data without calling Apps Script — so it
//    cannot re-check a session that was revoked since the data was
//    cached. This Worker does NOT move auth to the edge (KV holds no
//    session state, per the doc's explicit "auth stays on Apps Script for
//    B0") and does NOT re-validate on every cache hit — doing so would
//    mean every "warm" read still pays an Apps Script round trip, which
//    defeats B0's entire purpose. The residual exposure is bounded, not
//    eliminated:
//      - "today" entries: 60s TTL (matches the doc exactly) — a revoked
//        user can read cached today-data for at most 60s after revocation.
//      - "past" entries: the doc says "long TTL, they never change" — true
//        of the DATA, not of who's still allowed to see it. An unbounded
//        TTL would mean a revoked user's read access to old data never
//        self-heals without a manual KV purge. Capped at 24h here instead
//        of "forever" specifically to bound that window.
//    Writes (submitEntry, authenticate) always go straight through Apps
//    Script's full auth check — this trade-off only ever affects reads.
//    Flagged in the handoff; not silently decided.
//
// 4. Stampede/coalescing: per the doc's own allowance ("note this rather
//    than pretending a stateless Worker coalesces perfectly"), this is a
//    two-tier cache (Cache API in front of KV) with NO Durable Object
//    single-flight lock. KV alone already turns "15 concurrent misses" into
//    "15 KV reads" (cheap) rather than "15 Apps Script calls" (the actual
//    collapse) for every case except the narrow race where multiple colos
//    request the exact same still-uncached day within milliseconds of each
//    other — that residual case can still fan out more than one Apps
//    Script call. Noted, not solved, per B0's explicit scope.
//
// 5. Cache API entries are capped at a short, FIXED max-age (20s)
//    regardless of the underlying day's real TTL. Cache API is per-colo —
//    an invalidation issued from one colo does not clear another colo's
//    copy. Keeping the Cache API layer's own freshness window short bounds
//    that gap to ~20s worst case, independent of whatever TTL KV (the
//    globally-consistent, correctly-invalidated layer) is using.

const TTL_TODAY_SECONDS = 60;     // doc: "today → short TTL (~60s)"
const TTL_PAST_SECONDS  = 86400;  // capped, not "forever" — see note 3 above
const EDGE_CACHE_SECONDS = 20;    // Cache API layer's own freshness cap — see note 5

const CACHEABLE_GET_ACTIONS = new Set(['getRangeData', 'getDateData', 'getTodayData']);

const ALLOWED_ORIGINS = new Set([
  'https://buncheengern.pages.dev',
  'https://bcn.felismp.xyz',
]);
const ALLOWED_ORIGIN_SUFFIX = '.buncheengern.pages.dev'; // Pages preview URLs

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (origin.startsWith('https://') && origin.endsWith(ALLOWED_ORIGIN_SUFFIX)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true; // local dev
  return false;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function withCors(request, response) {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin)) return response; // browser blocks reading it client-side; server-side behavior unchanged
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Mirrors Code.gs's parseDdMmYyyy exactly — same regex, same UTC
// round-trip-validates-the-calendar-date check. Returns epoch ms or null.
function parseDdMmYyyy(s) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(s || ''));
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return ms;
}

function formatDdMmYyyy(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

// "Recent" (today ± 1 day, biased safe against client/spreadsheet timezone
// skew) gets the short TTL; genuinely past days get the capped-long TTL.
// Unparseable dates are treated as recent (never cached long on a guess).
function ttlFor(dateStr, nowMs) {
  const ms = parseDdMmYyyy(dateStr);
  if (ms === null) return TTL_TODAY_SECONDS;
  const dayMs = 86400000;
  const diffDays = Math.round((nowMs - ms) / dayMs);
  return diffDays <= 1 ? TTL_TODAY_SECONDS : TTL_PAST_SECONDS;
}

// Cheapest possible guard on the cache-hit path, where Apps Script's own
// per-request validateSession()+checkWhitelist() never runs (see design
// note 3 above) — rejects a request carrying no token at all before it
// ever reaches cache/KV. Deliberately NOT a real validity check (that
// needs Apps Script); this only stops a token-less request from reading
// cached data for free. Error shape matches Apps Script's respond({error})
// envelope so _checkAuthError() in the client handles it identically.
function requireSessionTokenPresent(url) {
  const token = (url.searchParams.get('sessionToken') || '').trim();
  return token ? null : jsonResponse({ status: 'error', error: 'AUTH_EXPIRED' });
}

function dayKvKey(dateStr) { return `day:${dateStr}`; }
function dayCacheRequest(dateStr) { return new Request(`https://bcn-api.internal/cache/day/${encodeURIComponent(dateStr)}`); }

// Read one day's {entries, tabName} through Cache API → KV → null (miss).
// A KV hit backfills the edge cache (fire-and-forget via ctx.waitUntil) so
// the next same-colo request skips KV too.
async function readDay(env, ctx, dateStr) {
  const cacheKey = dayCacheRequest(dateStr);
  const edgeHit = await caches.default.match(cacheKey);
  if (edgeHit) return edgeHit.json();

  const kvHit = await env.CACHE.get(dayKvKey(dateStr), 'json');
  if (kvHit) {
    const res = jsonResponse(kvHit);
    res.headers.set('Cache-Control', `max-age=${EDGE_CACHE_SECONDS}`);
    ctx.waitUntil(caches.default.put(cacheKey, res));
    return kvHit;
  }
  return null;
}

async function writeDay(env, ctx, dateStr, dayValue, nowMs) {
  const ttl = ttlFor(dateStr, nowMs);
  ctx.waitUntil(env.CACHE.put(dayKvKey(dateStr), JSON.stringify(dayValue), { expirationTtl: ttl }));
  const res = jsonResponse(dayValue);
  res.headers.set('Cache-Control', `max-age=${EDGE_CACHE_SECONDS}`);
  ctx.waitUntil(caches.default.put(dayCacheRequest(dateStr), res));
}

async function invalidateDay(env, ctx, dateStr) {
  ctx.waitUntil(env.CACHE.delete(dayKvKey(dateStr)));
  ctx.waitUntil(caches.default.delete(dayCacheRequest(dateStr)));
}

function appsScriptUrlFor(env, searchParams) {
  const url = new URL(env.APPS_SCRIPT_URL);
  for (const [k, v] of searchParams) url.searchParams.set(k, v);
  return url;
}

async function fetchAppsScriptGet(env, searchParams) {
  const url = appsScriptUrlFor(env, searchParams);
  const r = await fetch(url, { redirect: 'follow' });
  return r.json();
}

async function fetchAppsScriptPost(env, rawBody) {
  const r = await fetch(env.APPS_SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: rawBody,
  });
  return r.json();
}

async function handleGetDateData(request, env, ctx, url, action) {
  const noToken = requireSessionTokenPresent(url);
  if (noToken) return noToken;

  const date = url.searchParams.get('date');
  const cached = date ? await readDay(env, ctx, date) : null;
  if (cached) return jsonResponse({ status: 'success', entries: cached.entries, tabName: cached.tabName });

  const data = await fetchAppsScriptGet(env, url.searchParams);
  if (!data.error && date) {
    await writeDay(env, ctx, date, { entries: data.entries || [], tabName: data.tabName || date }, Date.now());
  }
  return jsonResponse(data);
}

async function handleGetRangeData(request, env, ctx, url) {
  const noToken = requireSessionTokenPresent(url);
  if (noToken) return noToken;

  const startDate = url.searchParams.get('startDate');
  const endDate   = url.searchParams.get('endDate');
  const startMs = parseDdMmYyyy(startDate);
  const endMs   = parseDdMmYyyy(endDate);

  // Malformed/unparseable range — let Apps Script produce its own error,
  // don't try to validate/replicate that logic here.
  if (startMs === null || endMs === null || endMs < startMs) {
    return jsonResponse(await fetchAppsScriptGet(env, url.searchParams));
  }

  const days = [];
  for (let ms = startMs; ms <= endMs; ms += 86400000) days.push(formatDdMmYyyy(ms));

  const cachedByDay = {};
  let allHit = true;
  for (const d of days) {
    const v = await readDay(env, ctx, d);
    if (v) cachedByDay[d] = v; else allHit = false;
  }

  if (allHit) {
    return jsonResponse({ status: 'success', days: days.map(d => ({ date: d, entries: cachedByDay[d].entries })) });
  }

  // Any miss → refetch the whole range from Apps Script (simpler and still
  // correct; only fetching the missing sub-days is a possible future
  // optimization, not required for B0 — see design note above). Backfill
  // every returned day into cache so the NEXT request, from any device,
  // is a full hit.
  const data = await fetchAppsScriptGet(env, url.searchParams);
  if (!data.error && Array.isArray(data.days)) {
    const now = Date.now();
    for (const day of data.days) await writeDay(env, ctx, day.date, { entries: day.entries, tabName: day.date }, now);
  }
  return jsonResponse(data);
}

async function handleGet(request, env, ctx, url) {
  const action = url.searchParams.get('action');
  if (!CACHEABLE_GET_ACTIONS.has(action)) {
    return jsonResponse(await fetchAppsScriptGet(env, url.searchParams));
  }
  if (action === 'getRangeData') return handleGetRangeData(request, env, ctx, url);
  return handleGetDateData(request, env, ctx, url, action); // getDateData | getTodayData
}

async function handlePost(request, env, ctx) {
  const rawBody = await request.text();
  let data = null;
  try { data = JSON.parse(rawBody); } catch { /* malformed — let Apps Script reject it */ }

  const result = await fetchAppsScriptPost(env, rawBody);

  // Write-through invalidation: submitEntry writes to exactly one tab
  // (data.sheetTabName), including for the Split→two-row path (still one
  // tab, multiple rows) — invalidate that one day so the next read for it
  // is forced fresh, regardless of which action fetched it into cache.
  if (data && data.action === 'submitEntry' && !result.error && data.sheetTabName) {
    await invalidateDay(env, ctx, data.sheetTabName);
  }

  return jsonResponse(result);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin');
      if (isAllowedOrigin(origin)) return new Response(null, { status: 204, headers: corsHeaders(origin) });
      return new Response(null, { status: 403 });
    }

    let response;
    try {
      const url = new URL(request.url);
      if (request.method === 'GET') {
        response = await handleGet(request, env, ctx, url);
      } else if (request.method === 'POST') {
        response = await handlePost(request, env, ctx);
      } else {
        response = jsonResponse({ status: 'error', error: `Unsupported method: ${request.method}` }, 405);
      }
    } catch (err) {
      response = jsonResponse({ status: 'error', error: err.message || 'Worker error' }, 500);
    }
    return withCors(request, response);
  },
};
