/* global document, localStorage, window */
(function () {
  try {
    var theme = localStorage.getItem('beike_theme');
    var dark = theme === 'dark' || (
      theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches
    );
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#121214' : '#F7F7F8');
  } catch {
    /* Storage can be blocked; the app still applies the theme after launch. */
  }
})();
