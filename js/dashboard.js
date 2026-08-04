// 📅 Date Helpers & Dashboard Navigation
function fmtDateTab(d) {
  return `${p2(d.getDate())}-${p2(d.getMonth()+1)}-${d.getFullYear()}`;
}

function dayStart(d) { const v = new Date(d); v.setHours(0,0,0,0); return v.getTime(); }
function isAfterToday(d) { return dayStart(d) >  dayStart(new Date()); }
function isOnToday(d)    { return dayStart(d) === dayStart(new Date()); }

function updateDateNav() {
  $('dash-date-lbl').textContent = fmtDateTab(dashDate);
  $('nav-next').disabled = isOnToday(dashDate) || isAfterToday(dashDate);
}

function hardResetDash() {
  dashEntries     = [];
  dashByBranchCur = buildTotals([]);
  dashByCur       = dashByBranchCur[activeBranchFilter];
  renderCurTabs();
  renderDashCur(activeCurTab);
  $('d-cnt').textContent = '—';
  $('d-list').innerHTML  = '';
}

function navDay(delta) {
  const d = new Date(dashDate);
  d.setDate(d.getDate() + delta);
  if (isAfterToday(d)) return;
  dashDate = d;
  hardResetDash();
  loadDash();
}

function normToDateKey(val) {
  const s = String(val ?? '').trim();
  if (!s) return '';
  let m;
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  if (s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  }
  m = s.match(/^(\d{4})[-\/](\d{2})[-\/](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  return '';
}

function filterByDate(entries, targetDate) {
  if (!entries.length) return [];
  const appKey = `${targetDate.getFullYear()}-${p2(targetDate.getMonth()+1)}-${p2(targetDate.getDate())}`;
  return entries.filter(e => normToDateKey(String(e.timestamp ?? '').trim()) === appKey);
}

// 📊 Dashboard Data Loading
function forceLoadDash() {
  delete rawApiCache[fmtDateTab(dashDate)];
  loadDash();
}

// 🦴 Skeleton for the cold dashboard load. The cards keep their real markup and
// are masked via a class, so the layout can't shift when values arrive; the
// entry list gets placeholder rows built from the same .ei shell.
function showDashSkeleton() {
  const dash = $('tab-dash');
  if (dash) dash.classList.add('is-loading');
  const list = $('d-list');
  if (list) {
    list.innerHTML = Array.from({ length: 4 }, () =>
      `<div class="ei ei-skel">
         <div class="skel skel-ic"></div>
         <div style="flex:1;min-width:0">
           <div class="skel skel-l1"></div>
           <div class="skel skel-l2"></div>
         </div>
         <div class="skel skel-amt"></div>
       </div>`).join('');
  }
}

function hideDashSkeleton() {
  const dash = $('tab-dash');
  if (dash) dash.classList.remove('is-loading');
}

async function loadDash() {
  const seq      = ++loadDashSeq;
  const snapDate = new Date(dashDate);
  const tab      = fmtDateTab(snapDate);
  const isToday  = isOnToday(snapDate);
  updateDateNav();

  // Stale-while-revalidate: if we have anything cached for this tab (persisted
  // across reloads), paint it immediately so there's no blank/spinner wait.
  const hadCache = rawApiCache[tab] !== undefined;
  if (hadCache) renderDash(filterByDate(rawApiCache[tab], snapDate));

  // Past days effectively never change; if already cached, trust it and skip the
  // network entirely. Today (and any uncached day) still revalidates below.
  if (!isToday && hadCache) return;

  // Nothing to show yet → fall back to the skeleton so the screen isn't empty.
  if (!hadCache) showDashSkeleton();
  try {
    const action = isToday ? 'getTodayData' : 'getDateData';
    const data   = await apiGet({ action, date: tab });
    if (seq !== loadDashSeq) { hideDashSkeleton(); return; }
    hideDashSkeleton();
    if (data.error) throw new Error(data.error);

    const raw = data.entries || [];
    rawApiCache[tab] = raw;
    persistDashCache(tab);
    renderDash(filterByDate(raw, snapDate));
  } catch (e) {
    if (seq !== loadDashSeq) { hideDashSkeleton(); return; }
    hideDashSkeleton();
    // A background refresh failed but we already have cached data on screen —
    // keep it (don't wipe good stale data) and just surface a toast. Only show
    // the full error state when there was nothing cached to fall back to.
    if (!hadCache) {
      renderDash([]);
      $('d-list').innerHTML = `<div class="empty">${t('errLoadDataFailed')}<br><small style="opacity:.6">${esc(e.message)}</small></div>`;
    }
    showToast(t('errGeneric', { msg: e.message }), 'err');
  }
}

// 💰 Dashboard Totals & Rendering
function currSym(c) { const cur = CURRENCIES.find(x => x.code === c); return cur ? cur.symbol : c; }

function emptyTotals() {
  const o = {};
  CURRENCIES.forEach(c => { o[c.code] = {cash:0,qr:0,exp:0,expCash:0,expQr:0}; });
  return o;
}

function buildTotals(entries) {
  const result = {};
  BRANCH_KEYS.forEach(s => { result[s] = emptyTotals(); });

  entries.forEach(e => {
    const p      = Number(e.price) || 0;
    const cur    = e.currency || 'LAK';
    const branch = e.shop || '';
    const isCash = (e.paymentMethod||'').toLowerCase().includes('cash');

    BRANCH_KEYS.forEach(s => { if (!result[s][cur]) result[s][cur] = {cash:0,qr:0,exp:0,expCash:0,expQr:0}; });

    const add = bucket => {
      if (e.type === 'Income') { if (isCash) bucket.cash += p; else bucket.qr += p; }
      else {
        bucket.exp += p;                                           // unchanged meaning: ALL expenses
        if (isCash) bucket.expCash += p; else bucket.expQr += p;   // new: partition of exp
      }
    };
    add(result['All'][cur]);
    if (result[branch]) add(result[branch][cur]);
  });
  return result;
}

function filteredEntries() {
  if (activeBranchFilter === 'All') return dashEntries;
  return dashEntries.filter(e => e.shop === activeBranchFilter);
}

function renderDash(entries) {
  dashEntries     = entries;
  dashByBranchCur = buildTotals(entries);
  dashByCur       = dashByBranchCur[activeBranchFilter];
  refreshDashUI();
}

function refreshDashUI() {
  renderCurTabs();

  const vis = filteredEntries();
  const billCount = new Set(vis.map((e, i) => e.transactionId || ('_row'+i))).size;
  $('d-cnt').textContent = t('entriesCount', { n: billCount });
  renderDashCur(activeCurTab);
  renderEntryList(vis);
}

// 📜 Entry List Rendering
function renderEntryList(entries) {
  if (!entries.length) {
    $('d-list').innerHTML = `<div class="empty">${
      isOnToday(dashDate) ? t('emptyEntriesToday') : t('emptyEntriesForDate', { date: fmtDateTab(dashDate) })
    }</div>`;
    return;
  }
  $('d-list').innerHTML = [...entries].reverse().map((e, idx) => {
    const delay  = Math.min(idx, 10) * 30;
    const isInc  = e.type === 'Income';
    const isCash = (e.paymentMethod||'').toLowerCase().includes('cash');
    const sym    = currSym(e.currency || 'LAK');
    const amt    = fmtN(e.price);
    const ts     = String(e.timestamp||'');
    const time   = ts.includes(' ') ? ts.split(' ')[1] : ts;
    const action = isInc
      ? (isCash ? t('actionCashIncome') : t('actionQRIncome'))
      : t('actionExpense');
    const actionColor = isInc ? 'var(--green)' : 'var(--red)';
    const safeSlip = safeUrl(e.slipUrl);
    const slipEl = safeSlip
      ? `&nbsp;·&nbsp;<a class="slip-a" href="${esc(safeSlip)}" target="_blank" rel="noopener">${t('slipLink')}</a>`
      : '';
    return `<div class="ei" style="animation-delay:${delay}ms">
      <div class="ei-ic ${isInc?'inc':'exp'}">${isInc?'↑':'↓'}</div>
      <div class="ei-info">
        <div class="ei-name">${esc(e.itemName)}</div>
        <div class="ei-meta"><span style="color:${actionColor};font-weight:700">${action}</span> · 👤 ${esc(e.staffName)} · 🏪 ${esc(e.shop)}</div>
        <div class="ei-meta" style="margin-top:1px;font-size:11px;color:var(--txt-muted)">⏱ ${time}${slipEl}</div>
      </div>
      <div class="ei-right">
        <div class="ei-amt ${isInc?'inc':'exp'}">${isInc?'+':'-'}${amt}&nbsp;${sym}</div>
        <div class="pm-b ${isCash?'pm-cash':'pm-qr'}">${isCash?'Cash':'Online'}</div>
      </div>
    </div>`;
  }).join('');
}

// 🔀 Dashboard Filter & Tab Switching
function switchBranchFilter(branch) {
  activeBranchFilter = branch;
  Object.entries(BRANCH_FILTER_IDS).forEach(([s, id]) => { const el = $(id); if (el) el.classList.toggle('on', s === branch); });
  dashByCur = dashByBranchCur[branch] || emptyTotals();
  refreshDashUI();
}

function switchCurTab(cur) {
  activeCurTab = cur;
  document.querySelectorAll('.ctab').forEach(btn => btn.classList.toggle('on', btn.id === 'ctab-' + cur));
  renderDashCur(cur);
}

function renderDashCur(cur) {
  const d   = dashByCur[cur] || {cash:0,qr:0,exp:0,expCash:0,expQr:0};
  const lbl = `${cur} ${currSym(cur)}`;
  $('d-cash').textContent = fmtN(d.cash); $('d-cash-c').textContent = lbl;
  $('d-qr').textContent   = fmtN(d.qr);  $('d-qr-c').textContent   = lbl;
  $('d-exp').textContent  = fmtN(d.exp);  $('d-exp-c').textContent  = lbl;

  // Derived summary values — display only, never stored.
  const net  = d.cash + d.qr - d.exp;   // net across both payment methods
  const onHd = d.cash - d.expCash;      // physical cash left from today's takings

  $('d-net').textContent   = fmtN(net);   $('d-net-c').textContent   = lbl;
  $('d-onhand').textContent = fmtN(onHd); $('d-onhand-c').textContent = lbl;

  // Colour by sign: both can legitimately go negative (expenses exceeding takings).
  $('d-net').className    = 'mc-val ' + (net  < 0 ? 'rv' : 'gv');
  $('d-onhand').className = 'mc-val ' + (onHd < 0 ? 'rv' : 'gv');

  renderDashChart(d);
}

// 📊 Percentage charts — derived from the same per-currency totals the cards
// use. Donut segments are drawn with stroke-dasharray (exact at 0% and 100%,
// unlike hand-computed arc paths).
const DONUT_C = 2 * Math.PI * 52;   // circumference for r=52 in the SVG viewBox

function renderDashChart(d) {
  const income = d.cash + d.qr;
  const seg = (el, share, offset) => {
    el.setAttribute('stroke-dasharray', `${share * DONUT_C} ${DONUT_C}`);
    el.setAttribute('stroke-dashoffset', `${-offset * DONUT_C}`);
  };

  if (income <= 0) {
    // No income for this currency — leave the track bare rather than dividing
    // by zero or implying a 0/0 split.
    seg($('dn-cash'), 0, 0);
    seg($('dn-qr'),   0, 0);
    $('pc-cash').textContent = '—';
    $('pc-qr').textContent   = '—';
    $('pc-exp').textContent  = '—';
    $('bar-exp').style.width = '0%';
    return;
  }

  const cashShare = d.cash / income;
  const qrShare   = d.qr   / income;
  seg($('dn-cash'), cashShare, 0);
  seg($('dn-qr'),   qrShare,   cashShare);   // starts where the cash arc ends

  const pct = n => Math.round(n * 100) + '%';
  $('pc-cash').textContent = pct(cashShare);
  $('pc-qr').textContent   = pct(qrShare);

  // Expense ratio can legitimately exceed 100% (spending more than the day's
  // takings). Show the true number, but clamp the bar so it can't overflow.
  const ratio = d.exp / income;
  $('pc-exp').textContent  = pct(ratio);
  $('bar-exp').style.width = Math.min(ratio, 1) * 100 + '%';
}

// 🧭 Tab Navigation
function switchTab(tab) {
  sessionStorage.setItem('bcn_activeTab', tab);   // survives reload; cleared on full app close
  ['rec','dash','settings'].forEach(t => {
    const el = $(`tab-${t}`);
    const isActive = t === tab;
    el.classList.toggle('hidden', !isActive);
    if (isActive) {
      el.classList.remove('tab-enter');
      void el.offsetWidth;
      el.classList.add('tab-enter');
    }
    $(`nb-${t}`).classList.toggle('on', isActive);
  });
  if (tab === 'dash') loadDash();
}

