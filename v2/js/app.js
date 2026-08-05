// Boot: language, theme, mount the entry screen, one store subscription,
// one initial render. Per bcn-v2-phase1-entry-prompt.md §5.

document.documentElement.setAttribute('data-theme', getTheme());

initLang();
mountEntryScreen();

store.subscribe(state => {
  applyTranslationsToDom();
  renderEntry(state);
});

applyTranslationsToDom();
renderEntry(store.get());
