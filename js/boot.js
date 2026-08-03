// ✅ Run on Page Load
document.addEventListener('DOMContentLoaded', () => {
  initCombo();
  renderBranchSegments();
  renderBranchFilters();
  renderManageBranchesList();
  renderCurSelect();
  renderCurTabs();
  renderManageCurrenciesList();
  renderCurrencyPicker('');

  const pickerList = $('cur-picker-list');
  if (pickerList) {
    pickerList.addEventListener('click', e => {
      const row = e.target.closest('.cur-row');
      if (!row || row.classList.contains('is-added')) return;
      const code   = row.dataset.code   || '';
      const symbol = row.dataset.symbol || '';
      if (!code || CURRENCIES.some(c => c.code.toUpperCase() === code.toUpperCase())) return;
      commitCurrencies([...CURRENCIES, { code, symbol }]);
      showToast(t('toastCurrencyAdded'));
    });
  }

  renderLangPicker('');
  const langPickerList = $('lang-picker-list');
  if (langPickerList) {
    langPickerList.addEventListener('click', e => {
      const row = e.target.closest('.cur-row');
      if (!row) return;
      const code = row.dataset.code || '';
      if (code) setLang(code);
    });
  }

  init();
});
