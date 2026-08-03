// 🏷️ Entry Type & Payment Toggles
function setSeg(key, val, btn) {
  A.fd[key] = val;
  btn.closest('.seg-wrap, .branch-grid').querySelectorAll('.seg, .branch-chip').forEach(s => s.classList.remove('on'));
  btn.classList.add('on');
  if (key === 'type') {
    const isExp = val === 'expense';
    $('sub-btn').className = `btn ${isExp ? 'btn-red' : 'btn-teal'}`;
    $('sub-btn').style.cssText = 'margin-top:16px';
  }
}

// ✂️ Split builder — a Split line is a set of toggle buckets, each with its own
// source (Cash/Online) AND currency. The line total derives from the ON parts,
// so no separate full total is entered. Buckets are a frontend authoring model;
// doSubmit flattens them to the parts payload the backend expects.
function seedSplitBuckets(line, cur) {
  if (Array.isArray(line.splitBuckets) && line.splitBuckets.length) return;
  line.splitBuckets = [
    { currency: cur, source: 'Cash',   on: true,  amount: '' },
    { currency: cur, source: 'Online', on: false, amount: '' },
  ];
}
function renderSplitBuilder(wrap, line) {
  if (!wrap) return;
  const buckets = line.splitBuckets || (line.splitBuckets = []);
  wrap.innerHTML = '';
  const order = [];
  buckets.forEach(b => { if (!order.includes(b.currency)) order.push(b.currency); });

  order.forEach(cur => {
    const grpBuckets = buckets.filter(b => b.currency === cur);
    const grp = document.createElement('div');
    grp.className = 'split-cur-grp';

    // header: currency code + live subtotal + remove-group (while ≥1 group remains)
    const head = document.createElement('div');
    head.className = 'split-cur-head';
    const code = document.createElement('span');
    code.className = 'split-cur-code';
    code.textContent = `${cur} ${currSym(cur)}`;
    const sub = document.createElement('span');
    sub.className = 'split-cur-sub';
    const updateSub = () => {
      const s = grpBuckets.reduce((t2, b) => { const n = amt(b.amount); return b.on && n > 0 ? t2 + n : t2; }, 0);
      sub.textContent = s > 0 ? formatAmount(String(Math.round(s * 100) / 100)) : '';
    };
    updateSub();
    head.append(code, sub);
    if (order.length > 1) {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'branch-del-btn';
      rm.textContent = '❌';
      rm.setAttribute('aria-label', t('ariaRemoveCurrency'));
      rm.addEventListener('click', () => {
        line.splitBuckets = line.splitBuckets.filter(b => b.currency !== cur);
        renderSplitBuilder(wrap, line);
      });
      head.appendChild(rm);
    }
    grp.appendChild(head);

    // Cash / Online toggle chips — independent on/off, ON reveals the amount input
    const segWrap = document.createElement('div');
    segWrap.className = 'seg-wrap';
    grpBuckets.forEach(b => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `seg ${b.source === 'Cash' ? 'cash' : 'qr'}${b.on ? ' on' : ''}`;
      chip.setAttribute('aria-pressed', String(b.on));
      chip.innerHTML = `${b.source === 'Cash' ? '💵' : '📱'} <span>${esc(t(b.source === 'Cash' ? 'payCash' : 'payQR'))}</span>`;
      chip.addEventListener('click', () => {
        b.on = !b.on;
        if (!b.on) b.amount = '';   // toggling OFF hides and clears its amount
        renderSplitBuilder(wrap, line);
      });
      segWrap.appendChild(chip);
    });
    grp.appendChild(segWrap);

    grpBuckets.forEach(b => {
      if (!b.on) return;
      const rowEl = document.createElement('div');
      rowEl.className = 'pg split-part-row';
      const ico = document.createElement('span');
      ico.className = 'cur-sel';
      ico.style.cssText = `pointer-events:none;color:var(--${b.source === 'Cash' ? 'amber' : 'teal'})`;
      ico.textContent = b.source === 'Cash' ? '💵' : '📱';
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'prc-in amt-fmt';
      inp.inputMode = 'decimal';
      inp.placeholder = t(b.source === 'Cash' ? 'labelSplitCash' : 'labelSplitOnline');
      inp.value = formatAmount(b.amount ?? '');
      inp.addEventListener('input', () => { b.amount = inp.value; updateSub(); });
      rowEl.append(ico, inp);
      grp.appendChild(rowEl);
    });

    wrap.appendChild(grp);
  });

  // ＋ Add currency — reveals a select of the not-yet-added currencies
  const avail = CURRENCIES.map(c => c.code).filter(c => !order.includes(c));
  if (avail.length) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-ghost split-add-btn';
    addBtn.textContent = t('splitAddCurrency');
    const sel = document.createElement('select');
    sel.className = 'fs split-add-sel hidden';
    sel.setAttribute('aria-label', t('splitAddCurrency'));
    sel.innerHTML = `<option value="" selected disabled>${esc(t('splitAddCurrency'))}</option>` +
      avail.map(c => `<option value="${esc(c)}">${esc(c)} ${esc(currSym(c))}</option>`).join('');
    addBtn.addEventListener('click', () => { addBtn.classList.add('hidden'); sel.classList.remove('hidden'); sel.focus(); });
    sel.addEventListener('change', () => {
      const codeVal = sel.value;
      if (!codeVal || line.splitBuckets.some(b => b.currency === codeVal)) return;
      line.splitBuckets.push(
        { currency: codeVal, source: 'Cash',   on: true,  amount: '' },
        { currency: codeVal, source: 'Online', on: false, amount: '' },
      );
      renderSplitBuilder(wrap, line);
    });
    wrap.append(addBtn, sel);
  }
}

function setPrimaryPay(val, btn) {
  A.fd.pay = val;
  btn.closest('.seg-wrap').querySelectorAll('.seg').forEach(s => s.classList.remove('on'));
  btn.classList.add('on');
  const isSplit = val === 'Split';
  if (isSplit) {
    seedSplitBuckets(A.fd, $('f-cur').value || (CURRENCIES[0] && CURRENCIES[0].code) || '');
    renderSplitBuilder($('split-grp-0'), A.fd);
  }
  // Split derives its total from the parts — hide the single amount input + chips
  $('f-price-row').classList.toggle('split-on', isSplit);
  $('price-suggest').classList.toggle('hidden', isSplit);
  $('split-grp-0').classList.toggle('hidden', !isSplit);
  updateSlipVisibility();
}
function updateSlipVisibility() {
  const needs = A.fd.pay === 'Online' || A.fd.pay === 'Split';
  $('slip-grp').classList.toggle('hidden', !needs);
  if (!needs) clearSlip();
}

// 📎 Slip Upload, Compression & Drag-Drop
async function onFileChg(inp) {
  const file = inp.files[0];
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) { showToast(t('errFileTooLarge'),'err'); return; }
  await loadFile(file);
}
async function loadFile(file) {
  try {
    const result = await compressImg(file);
    A.slip = result;
    const fr = new FileReader();
    fr.onload = () => {
      const img = $('slip-img');
      img.src = (fr.result);
      img.classList.remove('hidden');
      $('uz-ph').style.display = 'none';
      $('uz-cam').style.display = 'none';
      $('clr-slip').classList.remove('hidden');
    };
    fr.readAsDataURL(file);
  } catch(e) {
    showToast(t('errLoadImage'),'err');
  }
}
async function compressImg(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width:w, height:h } = img;
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
          fr2.onload = () => resolve({ b64: String(fr2.result).split(',')[1], mime:'image/jpeg', name:`slip_${Date.now()}.jpg` });
          fr2.onerror = reject; fr2.readAsDataURL(blob);
        }, 'image/jpeg', IMG_QUALITY);
      };
      img.onerror = reject; img.src = (fr.result);
    };
    fr.onerror = reject; fr.readAsDataURL(file);
  });
}
function clearSlip(e) {
  if (e) e.stopPropagation();
  A.slip = null; $('f-file').value = ''; $('f-cam').value = '';
  $('slip-img').classList.add('hidden'); $('slip-img').src = '';
  $('uz-ph').style.display = ''; $('uz-cam').style.display = ''; $('clr-slip').classList.add('hidden');
}
function onDragOver(e) { e.preventDefault(); $('uz').classList.add('over'); }
function onDragLeave()  { $('uz').classList.remove('over'); }
function onDrop(e) {
  e.preventDefault(); $('uz').classList.remove('over');
  const f = e.dataTransfer?.files[0];
  if (f?.type.startsWith('image/')) loadFile(f);
}

// 📝 Entry Submission Flow
// A Split line's valid parts: ON buckets with a positive amount (raw numbers).
function splitParts(line) {
  return (line.splitBuckets || [])
    .filter(b => b.on)
    .map(b => ({ source: b.source, currency: b.currency, amount: amt(b.amount) }))
    .filter(p => p.amount > 0);
}
function partsTotal(parts) {
  return Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100) / 100;
}

async function doSubmit() {
  const item  = $('f-item').value.trim();
  const cur   = $('f-cur').value;
  setMsg('f-msg');

  // Split lines derive their total from the enabled parts — no separate full total.
  const isPrimarySplit = A.fd.pay === 'Split';
  const primaryParts   = isPrimarySplit ? splitParts(A.fd) : [];
  const price          = isPrimarySplit ? partsTotal(primaryParts) : amt($('f-price').value);

  if (!CURRENCIES.length)  { setMsg('f-msg', t('warnNoCurrencies'),'warn'); return; }
  if (!item)               { setMsg('f-msg', t('warnEnterItemName'),'warn'); return; }
  if (isPrimarySplit) {
    if (!primaryParts.length) { setMsg('f-msg', t('warnSplitNeedOne'),'warn'); return; }
  } else if (!price || price <= 0) { setMsg('f-msg', t('warnEnterValidAmount'),'warn'); return; }

  const needsSlip = A.fd.pay === 'Online' || A.fd.pay === 'Split';
  if (needsSlip && !A.slip) { setMsg('f-msg', t('warnAttachSlip'),'warn'); return; }

  const toPayMethod = p => p === 'Online' ? 'Online Payment' : p === 'Split' ? 'Split' : 'Cash';
  const primaryAmt = { currency: cur, price, paymentMethod: toPayMethod(A.fd.pay) };
  if (isPrimarySplit) primaryAmt.parts = primaryParts;
  const amounts = [primaryAmt];
  const allPays = [A.fd.pay];
  const topPayMethod = allPays.every(p => p === 'Cash') ? 'Cash'
                     : allPays.every(p => p === 'Online') ? 'Online Payment'
                     : 'Cash + Online Payment';

  $('sub-btn').disabled = true;
  $('sub-txt').textContent = t('submitBtnSaving');

  try {
    showOv(needsSlip && A.slip ? t('ovUploadingSlip') : t('ovSavingEntry'));
    const ts  = nowStamp();
    const tab = fmtDateTab(new Date());
    const result = await apiPost({
      action:        'submitEntry',
      timestamp:     ts,
      sheetTabName:  tab,
      staffName:     A.me,
      userEmail:     A.userEmail || '',
      itemName:      item,
      currency:      cur,
      price:         Number(price) || 0,
      amounts:       amounts,
      lang:          currentLang,
      type:          A.fd.type === 'income' ? 'Income' : 'Expense',
      shop:          A.fd.shop,
      paymentMethod: topPayMethod,
      fileName:      A.slip?.name || '',
      fileData:      A.slip?.b64  || '',
      mimeType:      A.slip?.mime || '',
    });

    hideOv();

    if (result.status === 'error' || !result.success) {
      const msg = result.error || result.telegramError || 'Unknown error';
      setMsg('f-msg', t('errGeneric',{msg:esc(msg)}),'err');
      showToast(t('errGeneric', { msg }), 'err');
    } else {
      showToast(t('toastSaveSuccess'));
      if (result.telegramOk === false) {
        showToast(t('toastTelegramFailed', { msg: result.telegramError || 'Unknown error' }), 'warn');
      }
      resetForm();
      invalidateDashTab(tab);   // today's data changed → next dashboard open refetches fresh
    }
  } catch(e) {
    hideOv();
    setMsg('f-msg', t('errGeneric',{msg:esc(e.message)}),'err');
    showToast(t('errGeneric', { msg: e.message }), 'err');
  }

  $('sub-btn').disabled = false;
  $('sub-txt').textContent = t('submitBtn');
}

function resetForm() {
  $('f-item').value = ''; closeCombo(); $('f-price').value = ''; renderPriceSuggest(); $('f-cur').value = CURRENCIES.length ? CURRENCIES[0].code : '';
  A.fd.pay = 'Cash'; A.fd.splitBuckets = [];
  clearSlip(); setMsg('f-msg');
  document.querySelectorAll('#sg-type .seg').forEach((s,i) => s.classList.toggle('on', i===0));
  A.fd.type = 'income';
  const sb = $('sub-btn');
  sb.className = 'btn btn-teal'; sb.style.cssText = 'margin-top:16px';
  selectBranchSegment(A.fd.shop);
  document.querySelectorAll('#sg-pay-0 .seg').forEach((s,i) => s.classList.toggle('on', i===0));
  $('split-grp-0').innerHTML = ''; $('split-grp-0').classList.add('hidden');
  $('f-price-row').classList.remove('split-on');
  $('price-suggest').classList.remove('hidden');
}

