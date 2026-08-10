// The dashboard screen: range tiles, delta vs previous period, sparkline,
// income-mix donut, expense-ratio strip, recent-entries list. Per
// bcn-v2-phase2b-dashboard.md. Content area only — the grouped sidebar,
// accent/identity and Lao/Thai type pass are Phase 3.

// ── v2-local i18n — new strings this screen needs that have no v1 key.
// English only for now (per the phase-2b decision); folded into shared
// i18n/lang_*.js during Phase 3's localization pass instead of touching
// v1's i18n/ + service-worker CACHE for a handful of new labels now.
const DASH_STRINGS = {
  periodLabelLower: { today: 'today', week: 'this week', month: 'this month' },
  deltaNew:           'new',
  cashVsOnline:       'Cash vs online',
  spendShareOfIncome: 'Spend as a share of income',
  totalLabel:         'total',
  spentOfTaken:       '{spent} spent of {taken} taken in — {pct} retained',
  emptyEntriesPeriod: '📭 No entries {period}',
};

// ── Frozen math — ported verbatim from v1 js/dashboard.js. Only the source
// of branches/currencies changes (config.js instead of v1's globals); the
// bucket shape and add() logic are byte-identical. CLAUDE.md: this math
// requires explicit permission + proof to change — don't.
function dashEmptyTotals() {
  const o = {};
  window.getCurrencies().forEach(c => { o[c.code] = { cash: 0, qr: 0, exp: 0, expCash: 0, expQr: 0 }; });
  return o;
}

function dashBuildTotals(entries) {
  const branchKeys = ['All', ...window.getBranches()];
  const result = {};
  branchKeys.forEach(s => { result[s] = dashEmptyTotals(); });

  entries.forEach(e => {
    const p      = Number(e.price) || 0;
    const cur    = e.currency || 'LAK';
    const branch = e.shop || '';
    const isCash = (e.paymentMethod || '').toLowerCase().includes('cash');

    branchKeys.forEach(s => { if (!result[s][cur]) result[s][cur] = { cash: 0, qr: 0, exp: 0, expCash: 0, expQr: 0 }; });

    const add = bucket => {
      if (e.type === 'Income') { if (isCash) bucket.cash += p; else bucket.qr += p; }
      else {
        bucket.exp += p;                                          // unchanged meaning: ALL expenses
        if (isCash) bucket.expCash += p; else bucket.expQr += p;  // partition of exp
      }
    };
    add(result['All'][cur]);
    if (result[branch]) add(result[branch][cur]);
  });
  return result;
}

const EMPTY_BUCKET = { cash: 0, qr: 0, exp: 0, expCash: 0, expQr: 0 };

// ── Date helpers — calendar-boundary periods. "This week" = Monday through
// today; "this month" = the 1st through today. The previous period is the
// same calendar-aligned span shifted back one week/month, clamped at
// month-end, so the delta compares equal-length, weekday-aligned windows
// instead of a partial period against a full one.
function dayOnly(d) { const v = new Date(d); v.setHours(0, 0, 0, 0); return v; }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function mondayOf(d) {
  const wd = d.getDay(); // 0=Sun..6=Sat
  return addDays(d, wd === 0 ? -6 : -(wd - 1));
}
function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function sameDayPrevMonth(d) {
  const prevMonthLast = new Date(d.getFullYear(), d.getMonth(), 0); // day 0 = last day of previous month
  const clampedDay = Math.min(d.getDate(), prevMonthLast.getDate());
  return new Date(prevMonthLast.getFullYear(), prevMonthLast.getMonth(), clampedDay);
}
function enumerateDays(start, end) {
  const days = [];
  for (let d = dayOnly(start); d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

function periodRange(period) {
  const today = dayOnly(new Date());
  if (period === 'today') {
    return { current: { start: today, end: today }, previous: { start: addDays(today, -1), end: addDays(today, -1) } };
  }
  if (period === 'month') {
    const start = firstOfMonth(today);
    const prevAnchor = sameDayPrevMonth(today);
    return { current: { start, end: today }, previous: { start: firstOfMonth(prevAnchor), end: prevAnchor } };
  }
  // week (default)
  const start = mondayOf(today);
  return { current: { start, end: today }, previous: { start: addDays(start, -7), end: addDays(today, -7) } };
}

// ── Per-day immutable cache (bcn2_-prefixed) — mirrors v1's rawApiCache /
// persistDashCache pattern (js/core.js). Past days never change once
// written; only today's tab is ever refetched. getRangeData's
// { days:[{date,entries}] } response is merged in per-day so a period that
// was already fully (non-today) cached skips the network call entirely —
// this is what makes the previous period free after its first load.
const DASH_CACHE_KEY = 'bcn2_dashcache';
const DASH_CACHE_MAX = 70; // covers current+previous month (≤62 days) with margin
const dashDayCache = {};
let dashCacheOrder = [];

function loadDashCache() {
  try {
    const saved = JSON.parse(localStorage.getItem(DASH_CACHE_KEY) || 'null');
    if (saved && saved.data && typeof saved.data === 'object') {
      Object.keys(saved.data).forEach(k => { dashDayCache[k] = saved.data[k]; });
      dashCacheOrder = Array.isArray(saved.order)
        ? saved.order.filter(k => dashDayCache[k] !== undefined)
        : Object.keys(dashDayCache);
    }
  } catch { /* absent/corrupt cache — start empty */ }
}
function persistDashCache(tab) {
  if (tab) {
    dashCacheOrder = dashCacheOrder.filter(k => k !== tab);
    dashCacheOrder.push(tab);
    while (dashCacheOrder.length > DASH_CACHE_MAX) delete dashDayCache[dashCacheOrder.shift()];
  }
  try { localStorage.setItem(DASH_CACHE_KEY, JSON.stringify({ order: dashCacheOrder, data: dashDayCache })); }
  catch { /* quota/serialization — cache is an optimization, not state of record */ }
}
loadDashCache();

function entriesFromCache(tabs) { return tabs.flatMap(tab => dashDayCache[tab] || []); }

// Fetch one range, skipping the network entirely if every day in it is
// already cached and none of them is today (today always revalidates).
async function fetchRange(range) {
  const tabs = enumerateDays(range.start, range.end).map(window.fmtDateTab);
  const todayTab = window.fmtDateTab(new Date());
  const fullyCached = tabs.every(tab => dashDayCache[tab] !== undefined && tab !== todayTab);
  if (fullyCached) return { entries: entriesFromCache(tabs), tabs };

  const data = await window.apiGet({
    action: 'getRangeData',
    startDate: window.fmtDateTab(range.start),
    endDate:   window.fmtDateTab(range.end),
  });
  if (data.error) throw new Error(data.error);
  (data.days || []).forEach(day => { dashDayCache[day.date] = day.entries; persistDashCache(day.date); });
  return { entries: entriesFromCache(tabs), tabs };
}

// ── Store-backed dash state ─────────────────────────────────────────────
function defaultDashState() {
  const currencies = window.getCurrencies();
  return {
    period: 'week', branch: 'All', currency: currencies[0] ? currencies[0].code : '',
    currentEntries: [], previousEntries: [], dayTabsCurrent: [],
    loadingCurrent: false, loadingPrevious: false, errorCurrent: null, loadedOnce: false,
  };
}
function updateDash(patch) { store.set({ dash: { ...store.get().dash, ...patch } }); }

let loadSeq = 0;
async function loadPeriod(period) {
  const seq = ++loadSeq;
  const { current, previous } = periodRange(period);
  const curTabs  = enumerateDays(current.start, current.end).map(window.fmtDateTab);
  const prevTabs = enumerateDays(previous.start, previous.end).map(window.fmtDateTab);

  // Instant paint from whatever's cached (possibly partial/empty) — no blank wait.
  updateDash({
    period, dayTabsCurrent: curTabs,
    currentEntries: entriesFromCache(curTabs), previousEntries: entriesFromCache(prevTabs),
    loadingCurrent: true, loadingPrevious: true, errorCurrent: null, loadedOnce: true,
  });

  // Progressive: current and previous resolve independently, each repainting
  // as soon as it lands, instead of blocking on both together.
  fetchRange(current).then(r => {
    if (seq !== loadSeq) return;
    updateDash({ currentEntries: r.entries, dayTabsCurrent: r.tabs, loadingCurrent: false });
  }).catch(err => {
    if (seq !== loadSeq) return;
    updateDash({ loadingCurrent: false });
    if (err.authCode) return; // store.authError is already routing to login — no toast needed
    const stillEmpty = entriesFromCache(curTabs).length === 0;
    if (stillEmpty) updateDash({ errorCurrent: err.message });
    else showToast(t('errGeneric', { msg: err.message }), 'err');
  });

  fetchRange(previous).then(r => {
    if (seq !== loadSeq) return;
    updateDash({ previousEntries: r.entries, loadingPrevious: false });
  }).catch(err => {
    if (seq !== loadSeq) return;
    updateDash({ loadingPrevious: false });
    if (err.authCode) return;
    showToast(t('errGeneric', { msg: err.message }), 'err');
  });
}

// Called on entering the dashboard screen. A period switch always goes
// through loadPeriod() directly; this only covers "first ever visit" /
// "still mid-flight" so tabbing entry↔dash repeatedly doesn't refetch.
function ensureDashLoaded() {
  const d = store.get().dash;
  if (!d || d.loadedOnce || d.loadingCurrent) return;
  loadPeriod(d.period);
}

// ── Mount: DOM refs + static option lists ───────────────────────────────
let dashEls = {};
function mountDashboard() {
  dashEls = {
    branchSel:   document.getElementById('dash-branch'),
    periodSeg:   document.getElementById('dash-period-seg'),
    ctabs:       document.getElementById('dash-ctabs'),
    donutSub:    document.getElementById('dn-sub'),
    legTotal:    document.getElementById('leg-total'),
    pcCash:      document.getElementById('pc-cash'),
    pcQr:        document.getElementById('pc-qr'),
    dnCash:      document.getElementById('dn-cash'),
    dnQr:        document.getElementById('dn-qr'),
    expSub:      document.getElementById('exp-sub'),
    pcExp:       document.getElementById('pc-exp'),
    barExp:      document.getElementById('bar-exp'),
    expCap:      document.getElementById('exp-cap'),
    expCash:     document.getElementById('exp-cash-spent'),
    expQr:       document.getElementById('exp-qr-spent'),
    listCount:   document.getElementById('d-cnt'),
    list:        document.getElementById('d-list'),
    tiles: {
      net:     tileEls('net'),
      onhand:  tileEls('onhand'),
      income:  tileEls('income'),
      expense: tileEls('expense'),
    },
  };

  if (!store.get().dash) store.set({ dash: defaultDashState() });

  renderBranchOptions();
}
function tileEls(key) {
  return {
    val:   document.getElementById(`tv-${key}`),
    delta: document.getElementById(`td-${key}`),
    spark: document.getElementById(`sp-${key}`),
  };
}

function renderBranchOptions() {
  const sel = dashEls.branchSel;
  if (!sel) return;
  const current = store.get().dash?.branch || 'All';
  sel.innerHTML = [`<option value="All">${esc(t('allBranches'))}</option>`]
    .concat(window.getBranches().map(b => `<option value="${esc(b)}">${esc(b)}</option>`))
    .join('');
  sel.value = window.getBranches().includes(current) || current === 'All' ? current : 'All';
}

// ── Render ───────────────────────────────────────────────────────────────
function currSym(code) { const c = window.getCurrencies().find(x => x.code === code); return c ? c.symbol : code; }

function derived(bucket) {
  const income = bucket.cash + bucket.qr;
  return { net: bucket.cash + bucket.qr - bucket.exp, onHand: bucket.cash - bucket.expCash, income };
}

function deltaHtml(curr, prev, goodWhenIncreasing) {
  if (!prev) return `<span class="delta">${DASH_STRINGS.deltaNew}</span>`;
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  const increased = pct >= 0;
  const isGood = goodWhenIncreasing ? increased : !increased;
  const arrow = increased ? '▲' : '▼';
  return `<span class="delta ${isGood ? 'up' : 'down'}">${arrow} ${Math.abs(pct).toFixed(1)}%</span>`;
}

function sparklineSvg(values) {
  if (values.length < 2) return '';
  const w = 300, h = 34;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => `${Math.round(i * stepX)},${Math.round(h - ((v - min) / range) * h)}`);
  const line = pts.join(' ');
  const poly = `${pts[0]} ${pts.slice(1).join(' ')} ${w},${h} 0,${h}`;
  return `<polygon points="${poly}" fill="var(--spark-fill)"/>` +
         `<polyline points="${line}" fill="none" stroke="var(--spark)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
}

const DONUT_C = 2 * Math.PI * 52; // circumference for r=52, matches the mockup's viewBox

function renderDonutAndExpense(d, periodLower) {
  const income = d.cash + d.qr;
  const seg = (el, share, offset) => {
    if (!el) return;
    el.setAttribute('stroke-dasharray', `${share * DONUT_C} ${DONUT_C}`);
    el.setAttribute('stroke-dashoffset', `${-offset * DONUT_C}`);
  };
  dashEls.donutSub.textContent = `${DASH_STRINGS.cashVsOnline} · ${periodLower}`;
  dashEls.expSub.textContent   = `${DASH_STRINGS.spendShareOfIncome} · ${periodLower}`;

  if (income <= 0) {
    seg(dashEls.dnCash, 0, 0); seg(dashEls.dnQr, 0, 0);
    dashEls.pcCash.textContent = '—'; dashEls.pcQr.textContent = '—'; dashEls.pcExp.textContent = '—';
    dashEls.barExp.style.width = '0%';
    dashEls.legTotal.textContent = `0 — ${DASH_STRINGS.totalLabel}`;
    dashEls.expCap.textContent = '—';
  } else {
    const cashShare = d.cash / income, qrShare = d.qr / income;
    seg(dashEls.dnCash, cashShare, 0);
    seg(dashEls.dnQr, qrShare, cashShare);
    const pct = n => Math.round(n * 100) + '%';
    dashEls.pcCash.textContent = pct(cashShare);
    dashEls.pcQr.textContent   = pct(qrShare);
    dashEls.legTotal.textContent = `${fmtN(income)} ${currSym(store.get().dash.currency)} ${DASH_STRINGS.totalLabel}`;

    const ratio = d.exp / income;
    dashEls.pcExp.textContent  = pct(ratio);
    dashEls.barExp.style.width = Math.min(ratio, 1) * 100 + '%';
    const retained = Math.max(0, 1 - ratio);
    dashEls.expCap.textContent = DASH_STRINGS.spentOfTaken
      .replace('{spent}', `${fmtN(d.exp)} ${currSym(store.get().dash.currency)}`)
      .replace('{taken}', `${fmtN(income)} ${currSym(store.get().dash.currency)}`)
      .replace('{pct}', pct(retained));
  }
  dashEls.expCash.textContent = `${fmtN(d.expCash)} ${currSym(store.get().dash.currency)}`;
  dashEls.expQr.textContent   = `${fmtN(d.expQr)} ${currSym(store.get().dash.currency)}`;
}

// Per-tile sparklines — each tile plots its OWN metric per day (net, cash
// on hand, income, expense), matching the mockup's four distinct shapes.
function sparklineSeries(state, branch, currency, metric) {
  return state.dash.dayTabsCurrent.map(tab => {
    const bucket = dashBuildTotals(dashDayCache[tab] || [])[branch]?.[currency] || EMPTY_BUCKET;
    if (metric === 'exp') return bucket.exp;
    return derived(bucket)[metric];
  });
}

function renderEntryList(entries, periodLower) {
  if (!entries.length) {
    dashEls.list.innerHTML = `<div class="empty">${DASH_STRINGS.emptyEntriesPeriod.replace('{period}', periodLower)}</div>`;
    return;
  }
  const sorted = [...entries].sort((a, b) => parseTs(b.timestamp) - parseTs(a.timestamp));
  dashEls.list.innerHTML = sorted.map(e => {
    const isInc  = e.type === 'Income';
    const isCash = (e.paymentMethod || '').toLowerCase().includes('cash');
    const sym    = currSym(e.currency || 'LAK');
    const amtStr = fmtN(e.price);
    const ts     = String(e.timestamp || '');
    const time   = ts.includes(' ') ? ts.split(' ')[1] : ts;
    const action = isInc ? (isCash ? t('actionCashIncome') : t('actionQRIncome')) : t('actionExpense');
    const actionColor = isInc ? 'var(--green)' : 'var(--red)';
    const safeSlip = window.safeUrl ? window.safeUrl(e.slipUrl) : (e.slipUrl || '');
    const slipEl = safeSlip
      ? `&nbsp;·&nbsp;<a class="slip-a" href="${esc(safeSlip)}" target="_blank" rel="noopener">${t('slipLink')}</a>`
      : '';
    return `<div class="ei">
      <div class="ei-ic ${isInc ? 'inc' : 'exp'}">${isInc ? '↑' : '↓'}</div>
      <div class="ei-info">
        <div class="ei-name">${esc(e.itemName)}</div>
        <div class="ei-meta"><span style="color:${actionColor};font-weight:700">${action}</span> · 👤 ${esc(e.staffName)} · 🏪 ${esc(e.shop)}${slipEl ? ' · ⏱ ' + time + slipEl : ' · ⏱ ' + time}</div>
      </div>
      <div class="ei-right">
        <div class="ei-amt ${isInc ? 'gv' : 'rv'}">${isInc ? '+' : '−'}${amtStr}&nbsp;${sym}</div>
        <div class="pm-b ${isCash ? 'pm-cash' : 'pm-qr'}">${isCash ? esc(t('payCash')) : esc(t('payQR'))}</div>
      </div>
    </div>`;
  }).join('');
}
function parseTs(ts) {
  const m = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/.exec(String(ts || ''));
  if (!m) return 0;
  return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]).getTime();
}

function renderDashboard(state) {
  const d = state.dash;
  if (!d || !dashEls.list) return; // not mounted yet

  // Period seg + currency tabs + branch select reflect current selection.
  if (dashEls.periodSeg) {
    dashEls.periodSeg.querySelectorAll('[data-period]').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.period === d.period);
    });
  }
  if (dashEls.ctabs) {
    const currencies = window.getCurrencies();
    dashEls.ctabs.innerHTML = currencies.map(c =>
      `<button type="button" class="ctab${c.code === d.currency ? ' on' : ''}" data-action="selectDashCurrency" data-value="${esc(c.code)}">${esc(c.code)} ${esc(c.symbol)}</button>`
    ).join('');
  }
  if (dashEls.branchSel && dashEls.branchSel.value !== d.branch) dashEls.branchSel.value = d.branch;

  const totals     = dashBuildTotals(d.currentEntries);
  const prevTotals = dashBuildTotals(d.previousEntries);
  const bucket     = totals[d.branch]?.[d.currency] || EMPTY_BUCKET;
  const prevBucket = prevTotals[d.branch]?.[d.currency] || EMPTY_BUCKET;
  const cur  = derived(bucket);
  const prev = derived(prevBucket);
  const periodLower = DASH_STRINGS.periodLabelLower[d.period];

  const paint = (key, val, prevVal, goodUp, metric) => {
    const els = dashEls.tiles[key];
    if (!els.val) return;
    els.val.textContent = fmtN(val);
    els.val.className = 'tv ' + (val < 0 ? 'rv' : 'gv');
    els.delta.innerHTML = deltaHtml(val, prevVal, goodUp);
    els.spark.innerHTML = sparklineSvg(sparklineSeries(state, d.branch, d.currency, metric));
  };
  paint('net',     cur.net,    prev.net,       true,  'net');
  paint('onhand',  cur.onHand, prev.onHand,    true,  'onHand');
  paint('income',  cur.income, prev.income,    true,  'income');
  paint('expense', bucket.exp, prevBucket.exp, false, 'exp');

  renderDonutAndExpense(bucket, periodLower);

  const listEntries = d.branch === 'All' ? d.currentEntries : d.currentEntries.filter(e => e.shop === d.branch);
  const billCount = new Set(listEntries.map((e, i) => e.transactionId || ('_row' + i))).size;
  dashEls.listCount.textContent = `${t('entriesCount', { n: billCount })} · ${periodLower}`;
  renderEntryList(listEntries, periodLower);

  if (d.errorCurrent && !d.currentEntries.length) {
    dashEls.list.innerHTML = `<div class="empty">${t('errLoadDataFailed')}<br><small style="opacity:.6">${esc(d.errorCurrent)}</small></div>`;
  }
}

// ── Actions ──────────────────────────────────────────────────────────────
window.__actions.selectPeriod = el => loadPeriod(el.dataset.period);
window.__actions.selectDashCurrency = el => updateDash({ currency: el.dataset.value });
window.__binds.dashBranch = el => updateDash({ branch: el.value });

window.mountDashboard   = mountDashboard;
window.renderDashboard  = renderDashboard;
window.ensureDashLoaded = ensureDashLoaded;
