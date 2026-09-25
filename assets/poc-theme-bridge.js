/**
 * Sync PoC iframe apps with the parent site theme (someshjha-theme).
 * Parent script.js already broadcasts { type: 'theme', theme } and answers theme-request.
 */
(function () {
  const themeKey = 'someshjha-theme';

  function applyTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1520' : '#e8eef4');
  }

  function readStored() {
    try {
      const saved = localStorage.getItem(themeKey);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  applyTheme(readStored());

  if (window.parent !== window) {
    try {
      window.parent.postMessage({ type: 'theme-request' }, window.location.origin);
    } catch {
      // ignore cross-origin
    }
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'theme') {
      try {
        localStorage.setItem(themeKey, event.data.theme);
      } catch {
        // Theme still applies for this view.
      }
      applyTheme(event.data.theme);
    }
  });
})();
