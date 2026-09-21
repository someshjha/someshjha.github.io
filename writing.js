const articleFrame = document.querySelector('#article-frame');
const directLink = document.querySelector('#article-direct-link');
const articleButtons = [...document.querySelectorAll('[data-article-src]')];

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
  articleFrame.src = src;
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
