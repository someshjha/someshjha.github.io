const articleFrame = document.querySelector('#article-frame');
const directLink = document.querySelector('#article-direct-link');
const articleButtons = [...document.querySelectorAll('[data-article-src]')];

function embedSrc(src) {
  try {
    const url = new URL(src, window.location.href);
    url.searchParams.set('embed', '1');
    // Keep relative URLs when possible so GitHub Pages / local servers stay portable.
    return `${url.pathname.split('/').pop()}${url.search}${url.hash}`;
  } catch {
    const join = src.includes('?') ? '&' : '?';
    return src.includes('embed=1') ? src : `${src}${join}embed=1`;
  }
}

function resizeArticleFrame() {
  try {
    const doc = articleFrame.contentDocument;
    if (!doc) return;
    // scrollHeight can never read back below the iframe's own current height
    // (scrollHeight >= clientHeight), so a previous tall measurement would
    // pin every later, shorter one—collapse the frame first so the read
    // reflects the content's real height, not the last height we forced.
    articleFrame.style.height = '0px';
    const height = Math.max(
      doc.documentElement.scrollHeight,
      doc.body?.scrollHeight || 0,
      900
    );
    articleFrame.style.height = `${height}px`;
  } catch {
    articleFrame.style.height = '900px';
  }
}

function selectArticle(src) {
  articleButtons.forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.articleSrc === src));
  });
  articleFrame.src = embedSrc(src);
  // Direct link opens the standalone article (with footer), not the embed variant.
  directLink.href = src;
}

articleButtons.forEach((button) => {
  button.addEventListener('click', () => selectArticle(button.dataset.articleSrc));
});

articleFrame.addEventListener('load', () => {
  resizeArticleFrame();
  const doc = articleFrame.contentDocument;
  if (!doc) return;
  new ResizeObserver(() => requestAnimationFrame(resizeArticleFrame)).observe(doc.documentElement);
});

// The iframe's own width changes when the outer layout reflows (e.g. on window
// resize), which reflows its content's height too. Watching the iframe element
// itself catches that reliably; the raw window `resize` event can fire before
// the iframe's internal reflow has settled, leaving a stale, too-tall height.
new ResizeObserver(() => requestAnimationFrame(resizeArticleFrame)).observe(articleFrame);

// Sync the direct link and ensure the initial iframe src carries embed=1
// without forcing a redundant reload when the HTML already includes it.
if (articleFrame && directLink) {
  const initial = articleButtons.find((b) => b.getAttribute('aria-selected') === 'true')?.dataset.articleSrc
    || 'architecture-decision-system.html';
  directLink.href = initial;
  try {
    const current = new URL(articleFrame.getAttribute('src') || articleFrame.src, window.location.href);
    if (current.searchParams.get('embed') !== '1') {
      selectArticle(initial);
    }
  } catch {
    selectArticle(initial);
  }
}
