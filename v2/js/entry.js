// The entry screen: type, item, currency (+ inline add), two independent
// payment toggles, amount(s), branch, slip, confirmation sheet, submit.
// Per bcn-v2-phase1-entry-prompt.md §4.

// ── Default state ──────────────────────────────────────────────────────
function defaultEntryState() {
  const currencies = getCurrencies();
  const branches   = getBranches();
  return {
    type: 'income',
    item: '',
    currency: currencies[0] ? currencies[0].code : '',
    cash:   { on: true,  amount: '' },
    online: { on: false, amount: '' },
    branch: branches[0] || '',
    slip: null,
    submitting: false,
  };
}

// Transient, UI-only — whether the inline add-currency form is open. Not
// part of the entry shape in §4 (nothing to validate or submit), and not
// worth a store round-trip, so it stays a module-local variable that
// renderEntry() reads alongside store state.
let addingCurrency = false;

// The validated entry waiting on the confirmation sheet. Set by
// submitEntry(), read (and cleared) by confirmSubmit()/cancelConfirm().
let pending = null;

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMG_PX    = 1280;
const IMG_QUALITY   = 0.82;

let els = {};

// ── Mount: cache DOM refs, populate the lists config.js owns ───────────
function mountEntryScreen() {
  els = {
    typeToggle:  document.getElementById('type-toggle'),
    item:        document.getElementById('f-item'),
    cur:         document.getElementById('f-cur'),
    addToggle:   document.getElementById('add-cur-toggle'),
    addForm:     document.getElementById('add-cur-form'),
    addCode:     document.getElementById('add-cur-code'),
    addSym:      document.getElementById('add-cur-sym'),
    togCash:     document.getElementById('tog-cash'),
    togOnline:   document.getElementById('tog-online'),
    cashRow:     document.getElementById('amt-cash-row'),
    cashInput:   document.getElementById('f-cash-amt'),
    cashSym:     document.getElementById('cash-cur-sym'),
    onlineRow:   document.getElementById('amt-online-row'),
    onlineInput: document.getElementById('f-online-amt'),
    onlineSym:   document.getElementById('online-cur-sym'),
    totalRow:    document.getElementById('amt-total-row'),
    totalVal:    document.getElementById('amt-total-val'),
    branchGrid:  document.getElementById('branch-grid'),
    slipGrp:     document.getElementById('slip-grp'),
    slipFile:    document.getElementById('f-file'),
    slipImg:     document.getElementById('slip-img'),
    slipPh:      document.getElementById('uz-ph'),
    clrSlip:     document.getElementById('clr-slip'),
    msg:         document.getElementById('f-msg'),
    subBtn:      document.getElementById('sub-btn'),
    subTxt:      document.getElementById('sub-txt'),
  };

  if (!store.get().entry) store.set({ entry: defaultEntryState() });

  document.getElementById('entry-date').textContent = fmtDateTab(new Date());
  renderCurrencyOptions();
  renderBranchChips();
}

function updateEntry(patch) {
  store.set({ entry: { ...store.get().entry, ...patch } });
}

function renderCurrencyOptions() {
  const currencies = getCurrencies();
  const current = store.get().entry.currency;
  els.cur.innerHTML = currencies
    .map(c => `<option value="${esc(c.code)}">${esc(c.code)} ${esc(c.symbol)}</option>`)
    .join('');
  if (currencies.some(c => c.code === current)) {
    els.cur.value = current;
  } else if (currencies[0]) {
    // current selection no longer exists (or nothing was selected yet) —
    // fall back to the first available currency.
    updateEntry({ currency: currencies[0].code });
  }
}

// Rendered once at mount — Phase 1 has no branch management screen, so this
// list cannot change again until Settings (a later phase) exists.
function renderBranchChips() {
  const branches = getBranches();
  els.branchGrid.innerHTML = branches
    .map(b => `<button type="button" class="branch-chip" data-action="selectBranch" data-value="${esc(b)}">${esc(b)}</button>`)
    .join('');
}

// ── Validation — bcn-v2-phase1-entry-prompt.md §4, evaluated on every
// render for the submit button's disabled state, in the stated order. ──
function validationReason(e) {
  if (!e.cash.on && !e.online.on) return 'warnSplitNeedOne';
  if (!e.item.trim()) return 'warnEnterItemName';
  if (e.cash.on && !(amt(e.cash.amount) > 0)) return 'warnEnterValidAmount';
  if (e.online.on && !(amt(e.online.amount) > 0)) return 'warnEnterValidAmount';
  if (e.online.on && !e.slip) return 'warnAttachSlip';
  if (!e.currency) return 'warnNoCurrencies';
  return null;
}

// ── Render — a patch pass, not a rebuild. The markup lives once in
// index.html; this function syncs it to state on every store change.
// Rebuilding via innerHTML on every keystroke would replace the item/amount
// <input> nodes themselves and throw away focus + caret position, so text
// inputs are skipped here while they are the active element — the DOM is
// already authoritative for what the user is mid-typing; state catches up
// from the data-bind handler, and render() only needs to push state → DOM
// the other direction (e.g. after resetEntryForm(), or a tender toggling on
// with a cleared amount). ──
function renderEntry(state) {
  const e = state.entry;
  if (!e || !els.item) return; // not mounted yet

  // Type chips + submit button accent (income = primary, expense = red).
  els.typeToggle.querySelectorAll('.seg').forEach(btn => {
    btn.classList.toggle('on', btn.dataset.value === e.type);
  });
  els.subBtn.className = 'btn ' + (e.type === 'expense' ? 'btn-red' : 'btn-primary');

  if (document.activeElement !== els.item) els.item.value = e.item;
  els.cur.value = e.currency;
  els.addForm.classList.toggle('hidden', !addingCurrency);

  // Payment toggles — independent, no sibling is ever cleared.
  els.togCash.classList.toggle('on', e.cash.on);
  els.togOnline.classList.toggle('on', e.online.on);
  els.cashRow.classList.toggle('hidden', !e.cash.on);
  els.onlineRow.classList.toggle('hidden', !e.online.on);
  els.totalRow.classList.toggle('hidden', !(e.cash.on && e.online.on));
  els.cashSym.textContent = e.currency;
  els.onlineSym.textContent = e.currency;
  if (document.activeElement !== els.cashInput) els.cashInput.value = formatAmount(e.cash.amount);
  if (document.activeElement !== els.onlineInput) els.onlineInput.value = formatAmount(e.online.amount);
  if (e.cash.on && e.online.on) {
    const total = (amt(e.cash.amount) || 0) + (amt(e.online.amount) || 0);
    els.totalVal.textContent = `${fmtN(Math.round(total * 100) / 100)} ${e.currency}`;
  }

  // The slip rule is structural, not remembered: visible iff online.on, so
  // it can never be filled in and then silently ignored (v1's bug).
  els.slipGrp.classList.toggle('hidden', !e.online.on);
  if (e.slip) {
    els.slipImg.src = `data:${e.slip.mime};base64,${e.slip.b64}`;
    els.slipImg.classList.remove('hidden');
    els.slipPh.classList.add('hidden');
    els.clrSlip.classList.remove('hidden');
  } else {
    els.slipImg.classList.add('hidden');
    els.slipPh.classList.remove('hidden');
    els.clrSlip.classList.add('hidden');
  }

  els.branchGrid.querySelectorAll('.branch-chip').forEach(chip => {
    chip.classList.toggle('on', chip.dataset.value === e.branch);
  });

  const reason = validationReason(e);
  els.subBtn.disabled = !!reason || e.submitting;
  els.subTxt.textContent = t(e.submitting ? 'submitBtnSaving' : 'submitBtn');
  if (!e.submitting && reason) {
    els.msg.className = 'msg warn';
    els.msg.textContent = t(reason);
    els.msg.classList.remove('hidden');
  } else {
    els.msg.classList.add('hidden');
  }
}

// ── Actions (click) ─────────────────────────────────────────────────────
function toggleTender(key) {
  const e = store.get().entry;
  const cur = e[key];
  const on = !cur.on;
  updateEntry({ [key]: { on, amount: on ? cur.amount : '' } }); // OFF clears its amount
}

window.__actions.setType         = el => updateEntry({ type: el.dataset.value });
window.__actions.toggleCash      = () => toggleTender('cash');
window.__actions.toggleOnline    = () => toggleTender('online');
window.__actions.selectBranch    = el => updateEntry({ branch: el.dataset.value });
window.__actions.openFilePicker  = () => els.slipFile.click();
window.__actions.clearSlip       = () => { updateEntry({ slip: null }); els.slipFile.value = ''; };

window.__actions.toggleAddCurrency = () => {
  addingCurrency = !addingCurrency;
  renderEntry(store.get()); // local var only — store didn't change, so no subscriber fires
};
window.__actions.confirmAddCurrency = () => {
  const entry = addCurrency(els.addCode.value, els.addSym.value);
  if (!entry) return; // empty/invalid code or symbol — addCurrency() already guarded
  els.addCode.value = '';
  els.addSym.value  = '';
  addingCurrency = false;
  renderCurrencyOptions();
  updateEntry({ currency: entry.code }); // select the new currency immediately, per §4
};

// ── Slip capture — compressImg ported unchanged from v1 js/entry.js: same
// 1280px cap, 0.82 quality, 5MB limit. ──
window.__binds.slipFile = async el => {
  const file = el.files[0];
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) { showToast(t('errFileTooLarge'), 'err'); return; }
  try {
    const result = await compressImg(file);
    updateEntry({ slip: result }); // render() derives the <img> preview from this
  } catch {
    showToast(t('errLoadImage'), 'err');
  }
};
function compressImg(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > MAX_IMG_PX) { h = h * MAX_IMG_PX / w; w = MAX_IMG_PX; }
        if (h > MAX_IMG_PX) { w = w * MAX_IMG_PX / h; h = MAX_IMG_PX; }
        const cv = document.createElement('canvas');
        cv.width = Math.round(w); cv.height = Math.round(h);
        const ctx = cv.getContext('2d');
        if (!ctx) { reject(new Error('canvas 2d unavailable')); return; }
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(blob => {
          if (!blob) { reject(new Error('canvas toBlob failed')); return; }
          const fr2 = new FileReader();
          fr2.onload  = () => resolve({ b64: String(fr2.result).split(',')[1], mime: 'image/jpeg', name: `slip_${Date.now()}.jpg` });
          fr2.onerror = reject;
          fr2.readAsDataURL(blob);
        }, 'image/jpeg', IMG_QUALITY);
      };
      img.onerror = reject;
      img.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

// ── data-bind handlers ──────────────────────────────────────────────────
window.__binds.item        = el => updateEntry({ item: el.value });
window.__binds.currency    = el => updateEntry({ currency: el.value });
window.__binds.cashAmount  = el => updateEntry({ cash:   { ...store.get().entry.cash,   amount: el.value } });
window.__binds.onlineAmount= el => updateEntry({ online: { ...store.get().entry.online, amount: el.value } });

// ── Wire format — bcn-v2-phase1-entry-prompt.md §3. The two-toggle UI has
// no "Split" concept anywhere else in this screen, but Code.gs's row-writer
// still keys on exactly one trigger: amounts[0].paymentMethod === 'Split'
// with a `parts` array writes one row per tender. Since Code.gs isn't being
// touched, both-on has to keep sending that wire value even though nothing
// in the UI is called "Split" anymore. ──
function buildAmounts(e) {
  if (e.cash.on && e.online.on) {
    const cashAmt   = amt(e.cash.amount);
    const onlineAmt = amt(e.online.amount);
    return {
      topPayMethod: 'Cash + Online Payment',
      primary: {
        currency: e.currency,
        price: Math.round((cashAmt + onlineAmt) * 100) / 100,
        paymentMethod: 'Split',
        parts: [
          { source: 'Cash',   currency: e.currency, amount: cashAmt },
          { source: 'Online', currency: e.currency, amount: onlineAmt },
        ],
      },
    };
  }
  if (e.cash.on) {
    return { topPayMethod: 'Cash', primary: { currency: e.currency, price: amt(e.cash.amount), paymentMethod: 'Cash' } };
  }
  return { topPayMethod: 'Online Payment', primary: { currency: e.currency, price: amt(e.online.amount), paymentMethod: 'Online Payment' } };
}

function buildPending(e) {
  const { topPayMethod, primary } = buildAmounts(e);
  return {
    type: e.type === 'expense' ? 'Expense' : 'Income',
    item: e.item.trim(),
    branch: e.branch,
    slip: e.slip,
    topPayMethod,
    amounts: [primary],
  };
}

// Full payload keys are unchanged from v1 so Code.gs cannot tell v1 from v2.
function buildPayload(p, state) {
  return {
    action:        'submitEntry',
    timestamp:     nowStamp(),
    sheetTabName:  fmtDateTab(new Date()),
    staffName:     state.staffName || '', // no auth screen yet this phase
    userEmail:     state.userEmail || '',
    itemName:      p.item,
    currency:      p.amounts[0].currency,
    price:         Number(p.amounts[0].price) || 0,
    amounts:       p.amounts,
    lang:          state.lang,
    type:          p.type,
    shop:          p.branch,
    paymentMethod: p.topPayMethod,
    fileName:      p.slip?.name || '',
    fileData:      p.slip?.b64  || '',
    mimeType:      p.slip?.mime || '',
  };
}

// ── Confirmation sheet — mirrors v1's field order (type, item, cost
// lines, method, branch, slip yes/no). ──
function confirmRow(k, v) { return `<div class="cfm-row"><span class="cfm-k">${k}</span><span class="cfm-v">${v}</span></div>`; }

function showConfirmSheet(p) {
  const isInc = p.type === 'Income';
  const cfmType = document.getElementById('cfm-type');
  cfmType.textContent = isInc ? t('typeIncome') : t('typeExpense');
  cfmType.className = 'cfm-type ' + (isInc ? 'inc' : 'exp');

  const primary = p.amounts[0];
  const parts   = primary.parts || [];
  const payName = src => src === 'Cash' ? t('payCash') : t('payQR');
  const costLines = parts.length
    ? parts.map(pt => `${fmtN(pt.amount)} ${esc(pt.currency)} · ${esc(payName(pt.source))}`).join('<br>')
    : `${fmtN(primary.price)} ${esc(primary.currency)}`;

  document.getElementById('cfm-body').innerHTML = [
    confirmRow(t('labelItemName'),      esc(p.item)),
    confirmRow(t('labelAmount'),        costLines),
    confirmRow(t('labelPaymentMethod'), esc(p.topPayMethod)),
    confirmRow(t('labelBranch'),        esc(p.branch)),
    confirmRow(t('labelAttachSlip'),    p.slip ? '✅' : '—'),
  ].join('');

  document.getElementById('cfm-save').disabled = false;
  document.getElementById('cfm-sheet').classList.remove('hidden');
}
function hideConfirmSheet() { document.getElementById('cfm-sheet').classList.add('hidden'); }

window.__actions.submitEntry = () => {
  const e = store.get().entry;
  if (validationReason(e)) return; // button is disabled otherwise — defensive only
  pending = buildPending(e);
  showConfirmSheet(pending);
};
window.__actions.cancelConfirm = () => { pending = null; hideConfirmSheet(); };
// Exact-target check replicates v1's backdrop-click-to-dismiss: `el` is
// #cfm-sheet (the only ancestor with data-action on this path); clicking
// anything inside the card makes e.target a descendant, not el, so only a
// direct click on the backdrop itself dismisses.
window.__actions.confirmBackdrop = (el, e) => { if (e.target === el) window.__actions.cancelConfirm(); };

function resetEntryForm() {
  updateEntry({
    type: 'income',
    item: '',
    cash: { on: true, amount: '' },
    online: { on: false, amount: '' },
    slip: null,
    // currency + branch intentionally kept, matching v1's resetForm — staff
    // usually keep entering for the same branch/currency back to back.
  });
  els.slipFile.value = '';
}

window.__actions.confirmSubmit = async () => {
  if (!pending) return;
  document.getElementById('cfm-save').disabled = true; // double-tap guard — before the first await
  hideConfirmSheet();
  updateEntry({ submitting: true });

  try {
    showOv(pending.slip ? t('ovUploadingSlip') : t('ovSavingEntry'));
    const result = await apiPost(buildPayload(pending, store.get()));
    hideOv();

    if (result.status === 'error' || !result.success) {
      const msg = result.error || result.telegramError || 'Unknown error';
      showToast(t('errGeneric', { msg }), 'err');
    } else {
      showToast(t('toastSaveSuccess'));
      if (result.telegramOk === false) {
        showToast(t('toastTelegramFailed', { msg: result.telegramError || 'Unknown error' }), 'warn');
      }
      resetEntryForm();
    }
  } catch (err) {
    hideOv();
    showToast(t('errGeneric', { msg: err.message }), 'err');
  }

  pending = null;
  updateEntry({ submitting: false });
};

// Explicit export line per bcn-v2-phase1-entry-prompt.md §1b.
window.mountEntryScreen = mountEntryScreen;
window.renderEntry      = renderEntry;
