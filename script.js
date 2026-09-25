if (window.top !== window.self) {
  document.documentElement.classList.add('embedded-frame');
}

const header = document.querySelector('[data-header]');
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.nav');
const themeKey = 'someshjha-theme';

function getPreferredTheme() {
  let saved;
  try {
    saved = localStorage.getItem(themeKey);
  } catch {
    saved = null;
  }
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function notifyFrames(theme) {
  document.querySelectorAll('iframe').forEach((frame) => {
    try {
      frame.contentWindow?.postMessage({ type: 'theme', theme }, window.location.origin);
    } catch {
      // Cross-origin frames are ignored; this site only embeds same-origin pages.
    }
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0b1520' : '#e8eef4');
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  });
  notifyFrames(theme);
}

function mountThemeToggle() {
  // Floats fixed at the bottom of the viewport, outside the nav/hamburger menu,
  // so it stays reachable on mobile without opening the menu first.
  if (document.querySelector('[data-theme-toggle]')) return;

  const button = document.createElement('button');
  button.className = 'theme-toggle';
  button.type = 'button';
  button.dataset.themeToggle = '';
  button.innerHTML = `<span class="theme-icon" aria-hidden="true">
    <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.6"/><path d="M12 2.5v2.6M12 18.9v2.6M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>
    <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
  </span>`;
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(themeKey, next);
    } catch {
      // Theme still applies for this page view when storage is unavailable.
    }
    applyTheme(next);
  });

  document.body.appendChild(button);
}

const triadMock = Boolean(document.documentElement.dataset.triad);
const initialTheme = triadMock ? 'light' : getPreferredTheme();
if (!triadMock) {
  mountThemeToggle();
}
applyTheme(initialTheme);

const setHeader = () => header?.classList.toggle('scrolled', window.scrollY > 24);
if (header) {
  setHeader();
  window.addEventListener('scroll', setHeader, { passive: true });
}

navToggle?.addEventListener('click', () => {
  const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
  navToggle.setAttribute('aria-expanded', String(!isOpen));
  nav?.classList.toggle('open', !isOpen);
  header?.classList.toggle('nav-open', !isOpen);
  document.body.style.overflow = isOpen ? '' : 'hidden';
});

nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  navToggle.setAttribute('aria-expanded', 'false');
  nav.classList.remove('open');
  header?.classList.remove('nav-open');
  document.body.style.overflow = '';
}));

document.querySelectorAll('[data-year]').forEach((el) => {
  el.textContent = new Date().getFullYear();
});

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === 'theme' && (event.data.theme === 'dark' || event.data.theme === 'light')) {
    try {
      localStorage.setItem(themeKey, event.data.theme);
    } catch {
      // Theme still applies for this page view when storage is unavailable.
    }
    applyTheme(event.data.theme);
    return;
  }
  if (event.data?.type !== 'theme-request') return;
  event.source?.postMessage({ type: 'theme', theme: document.documentElement.dataset.theme }, event.origin);
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion || !('IntersectionObserver' in window)) {
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('visible'));
} else {
  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px' });
  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
}
