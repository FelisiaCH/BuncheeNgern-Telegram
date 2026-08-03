// 🧾 Item Picker — localized suggestions feed BOTH an inline type-ahead dropdown
// (while typing) and a modal popup (chevron button). The field is ALWAYS free
// text: any typed value, even one not in the list, submits unchanged.
// Grouped suggestions [{cat, items:[]}]; tolerates a legacy flat string[].
function itemSuggestionGroups() {
  const v = t('itemSuggestions');
  if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;           // grouped shape
  if (Array.isArray(v)) return v.length ? [{ cat: '', items: v.map(String) }] : []; // legacy flat
  return [];
}
// Flat list of every item string (used for match counts).
function itemSuggestionList() {
  return itemSuggestionGroups().flatMap(g => (g.items || []).map(String));
}

// Render groups whose items match `query` into `container` (empty query → all).
// `wire(btn, opt)` attaches the pick handler — inline uses mousedown so the pick
// beats the field's blur; the popup uses click. Returns total matched item count.
function buildGroupedOptions(container, query, wire) {
  const q = String(query || '').trim().toLowerCase();
  container.innerHTML = '';
  let count = 0;
  itemSuggestionGroups().forEach(g => {
    const items = (g.items || []).filter(o => !q || String(o).toLowerCase().includes(q));
    if (!items.length) return;
    if (g.cat) {
      const h = document.createElement('div');
      h.className = 'combo-cat';
      h.textContent = g.cat;
      container.appendChild(h);
    }
    items.forEach(opt => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'combo-opt';
      btn.textContent = opt;
      wire(btn, opt);
      container.appendChild(btn);
    });
    count += items.length;
  });
  return count;
}

// --- Inline type-ahead dropdown (under the field) ---
// Build #combo-drop with the suggestions matching `query` (empty → all).
// Returns the match count so callers can decide whether to show it.
function renderComboOptions(query) {
  const drop = $('combo-drop');
  if (!drop) return 0;
  return buildGroupedOptions(drop, query, (btn, opt) =>
    btn.addEventListener('mousedown', e => { e.preventDefault(); pickCombo(opt); }));
}
function initCombo() {
  // Open/close is driven by the field's own focus/input/blur events — no
  // document-level click handler, so there is no open/close race (the old bug
  // where the dropdown vanished the instant it opened).
  renderComboOptions('');
}
// Show the inline dropdown only while the field has text AND there are matches;
// otherwise hide it (the custom typed value stays submittable).
function updateInlineSuggest() {
  const q = $('f-item').value;
  const n = renderComboOptions(q);
  if (q.trim() !== '' && n > 0) $('combo-drop').classList.remove('hidden');
  else closeCombo();
}
function onItemInput() { updateInlineSuggest(); }
function onItemFocus() { updateInlineSuggest(); }
function onItemBlur()  { setTimeout(closeCombo, 150); }   // let an option click register first
function closeCombo()  { $('combo-drop').classList.add('hidden'); }
function pickCombo(val) {
  $('f-item').value = val;
  closeCombo();
  $('f-item').focus();             // field stays editable
}

// --- Modal popup picker (chevron button): all suggestions + search + close ---
function openItemPopup() {
  closeCombo();
  const search = $('item-popup-search');
  if (search) search.value = '';
  renderItemPopupList('');
  $('item-popup').classList.remove('hidden');
  if (search) setTimeout(() => search.focus(), 50);
}
function closeItemPopup() { $('item-popup').classList.add('hidden'); }
function onItemPopupBackdrop(e) { if (e.target === $('item-popup')) closeItemPopup(); }
function renderItemPopupList(query) {
  const list = $('item-popup-list');
  if (!list) return 0;
  const n = buildGroupedOptions(list, query, (btn, opt) =>
    btn.addEventListener('click', () => pickItemFromPopup(opt)));
  if (!n) list.innerHTML = '<div class="item-popup-empty">—</div>';
  return n;
}
function pickItemFromPopup(val) {
  $('f-item').value = val;
  closeItemPopup();
  $('f-item').focus();             // field stays editable
  closeCombo();                    // don't auto-reopen the inline dropdown after a popup pick
}

// 🏪 Branch Management
function renderBranchSegments() {
  const wrap = $('sg-branch');
  if (!wrap) return;
  const current = BRANCHES.includes(A.fd.shop) ? A.fd.shop : BRANCHES[0];
  A.fd.shop = current;
  wrap.innerHTML = '';
  BRANCHES.forEach((name, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `branch-chip${name === current ? ' on' : ''}`;
    btn.textContent = `${BRANCH_ICONS[i % BRANCH_ICONS.length]} ${name}`;
    btn.addEventListener('click', () => setSeg('shop', name, btn));
    wrap.appendChild(btn);
  });
}

function renderBranchFilters() {
  const wrap = $('branch-filter');
  if (!wrap) return;
  if (!BRANCH_KEYS.includes(activeBranchFilter)) activeBranchFilter = 'All';
  wrap.innerHTML = '';
  BRANCH_FILTER_IDS = {};

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.id = 'sf-All';
  allBtn.className = `sf${activeBranchFilter === 'All' ? ' on' : ''}`;
  allBtn.textContent = `🏢 ${t('allBranches')}`;
  allBtn.addEventListener('click', () => switchBranchFilter('All'));
  wrap.appendChild(allBtn);
  BRANCH_FILTER_IDS['All'] = 'sf-All';

  BRANCHES.forEach((name, i) => {
    const id = `sf-branch-${i}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = id;
    btn.className = `sf${activeBranchFilter === name ? ' on' : ''}`;
    btn.textContent = `${BRANCH_ICONS[i % BRANCH_ICONS.length]} ${name}`;
    btn.addEventListener('click', () => switchBranchFilter(name));
    wrap.appendChild(btn);
    BRANCH_FILTER_IDS[name] = id;
  });
}

function selectBranchSegment(value) {
  const target = BRANCHES.includes(value) ? value : BRANCHES[0];
  A.fd.shop = target;
  document.querySelectorAll('#sg-branch .branch-chip').forEach((btn, i) => btn.classList.toggle('on', BRANCHES[i] === target));
}

function commitBranches(list) {
  BRANCHES    = list;
  BRANCH_KEYS = ['All', ...BRANCHES];
  localStorage.setItem(BRANCHES_KEY, JSON.stringify(BRANCHES));

  if (!BRANCHES.includes(A.fd.shop)) A.fd.shop = BRANCHES[0] || '';
  if (!BRANCH_KEYS.includes(activeBranchFilter)) activeBranchFilter = 'All';

  renderBranchSegments();
  renderBranchFilters();
  renderManageBranchesList();

  if (!$('scr-app').classList.contains('hidden') && !$('tab-dash').classList.contains('hidden')) {
    dashByBranchCur = buildTotals(dashEntries);
    dashByCur       = dashByBranchCur[activeBranchFilter];
    refreshDashUI();
  }
}

function addBranch() {
  const input = $('m-branch-new');
  const name  = (input?.value || '').trim();
  if (!name) { showToast(t('warnEnterBranchName'), 'warn'); return; }
  if (BRANCHES.includes(name)) { showToast(t('warnBranchExists'), 'warn'); return; }

  commitBranches([...BRANCHES, name]);
  if (input) input.value = '';
  showToast(t('toastBranchAdded'));
}

function removeBranch(name) {
  if (BRANCHES.length <= 1) { showToast(t('warnNeedOneBranch'), 'warn'); return; }
  if (!confirm(t('confirmDeleteBranch', { name }))) return;

  commitBranches(BRANCHES.filter(b => b !== name));
  showToast(t('toastBranchRemoved'));
}

function renderManageBranchesList() {
  const wrap = $('manage-branch-list');
  if (!wrap) return;
  wrap.innerHTML = '';

  if (!BRANCHES.length) {
    const hint = document.createElement('div');
    hint.className = 'branch-empty-hint';
    hint.textContent = t('warnNeedOneBranch');
    wrap.appendChild(hint);
    return;
  }

  BRANCHES.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'branch-row';

    const icon = document.createElement('span');
    icon.className = 'branch-row-icon';
    icon.textContent = BRANCH_ICONS[i % BRANCH_ICONS.length];

    const label = document.createElement('span');
    label.className = 'branch-row-name';
    label.textContent = name;
    label.title = name;

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'branch-del-btn';
    delBtn.textContent = '❌';
    delBtn.setAttribute('aria-label', t('ariaDeleteBranch'));
    delBtn.addEventListener('click', () => removeBranch(name));

    row.append(icon, label, delBtn);
    wrap.appendChild(row);
  });
}

// 💱 Currency Management
function commitCurrencies(list) {
  CURRENCIES = list;
  localStorage.setItem(CURRENCIES_KEY, JSON.stringify(CURRENCIES));
  if (!CURRENCIES.length) activeCurTab = '';
  else if (!CURRENCIES.find(c => c.code === activeCurTab)) activeCurTab = CURRENCIES[0].code;
  const curFallback = CURRENCIES.length ? CURRENCIES[0].code : '';
  (A.fd.splitBuckets || []).forEach(b => {
    if (!CURRENCIES.find(c => c.code === b.currency)) b.currency = curFallback;
  });
  renderCurSelect();
  if (A.fd.pay === 'Split') renderSplitBuilder($('split-grp-0'), A.fd);
  renderManageCurrenciesList();
  renderCurrencyPicker($('cur-picker-search')?.value || '');
  if (!$('scr-app').classList.contains('hidden') && !$('tab-dash').classList.contains('hidden')) {
    dashByBranchCur = buildTotals(dashEntries);
    dashByCur       = dashByBranchCur[activeBranchFilter];
    refreshDashUI();
  } else {
    renderCurTabs();
  }
}

function renderCurrencyPicker(query) {
  const list = $('cur-picker-list');
  if (!list || !window.CURRENCY_DATA) return;
  const q = (query || '').trim().toLowerCase();
  const addedCodes = new Set(CURRENCIES.map(c => c.code.toUpperCase()));
  let html = '';
  for (const [region, items] of Object.entries(window.CURRENCY_DATA)) {
    const filtered = q
      ? items.filter(c =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q))
      : items;
    if (!filtered.length) continue;
    html += `<div class="cur-region-hdr">${esc(region)}</div>`;
    for (const c of filtered) {
      const added = addedCodes.has(c.code.toUpperCase());
      html += `<div class="cur-row${added ? ' is-added' : ''}" data-code="${esc(c.code)}" data-symbol="${esc(c.symbol)}">` +
        `<span class="cur-row-sym">${esc(c.symbol)}</span>` +
        `<span class="cur-row-info">` +
          `<div class="cur-row-code">${esc(c.code)} · ${esc(c.name)}</div>` +
          `<div class="cur-row-name">${esc(c.country)}</div>` +
        `</span>` +
        (added ? `<span class="cur-added-badge">${t('labelCurrencyAdded')}</span>` : '') +
        `</div>`;
    }
  }
  if (!html) {
    html = `<div style="padding:16px;text-align:center;color:var(--txt-muted);font-size:13px">—</div>`;
  }
  list.innerHTML = html;
}

function removeCurrency(code) {
  if (!confirm(t('confirmDeleteCurrency', { code }))) return;
  commitCurrencies(CURRENCIES.filter(c => c.code !== code));
  showToast(t('toastCurrencyRemoved'));
}

function renderManageCurrenciesList() {
  const wrap = $('manage-currency-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!CURRENCIES.length) {
    const hint = document.createElement('div');
    hint.className = 'branch-empty-hint';
    hint.textContent = t('noCurrenciesHint');
    wrap.appendChild(hint);
    return;
  }
  CURRENCIES.forEach(({ code, symbol }) => {
    const row = document.createElement('div');
    row.className = 'branch-row';
    const iconEl = document.createElement('span');
    iconEl.className = 'branch-row-icon';
    iconEl.textContent = symbol;
    const label = document.createElement('span');
    label.className = 'branch-row-name';
    label.textContent = code;
    label.title = `${code} ${symbol}`;
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'branch-del-btn';
    delBtn.textContent = '❌';
    delBtn.setAttribute('aria-label', t('ariaDeleteCurrency'));
    delBtn.addEventListener('click', () => removeCurrency(code));
    row.append(iconEl, label, delBtn);
    wrap.appendChild(row);
  });
}

function renderCurSelect() {
  const sel = $('f-cur');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  if (!CURRENCIES.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = t('noCurrenciesOption');
    sel.appendChild(opt);
    return;
  }
  CURRENCIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.code;
    opt.textContent = `${c.code} ${c.symbol}`;
    sel.appendChild(opt);
  });
  sel.value = CURRENCIES.find(c => c.code === prev) ? prev : CURRENCIES[0].code;
}

function dashCurCodes() {
  const codes = CURRENCIES.map(c => c.code);
  dashEntries.forEach(e => { if (e.currency && !codes.includes(e.currency)) codes.push(e.currency); });
  return codes;
}

function renderCurTabs() {
  const wrap = $('cur-tabs');
  if (!wrap) return;
  const codes = dashCurCodes();
  if (!codes.length) { wrap.innerHTML = ''; return; }
  if (!codes.includes(activeCurTab)) activeCurTab = codes[0];
  wrap.innerHTML = '';
  codes.forEach(code => {
    const sym = currSym(code);
    const btn = document.createElement('button');
    btn.className = 'ctab' + (code === activeCurTab ? ' on' : '');
    btn.id = 'ctab-' + code;
    btn.textContent = `${code} ${sym}`;
    btn.onclick = () => switchCurTab(code);
    const d = (dashByCur || {})[code] || {cash:0,qr:0,exp:0,expCash:0,expQr:0};
    if (d.cash > 0 || d.qr > 0 || d.exp > 0) btn.classList.add('has');
    wrap.appendChild(btn);
  });
}

