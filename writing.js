const articleFrame = document.querySelector('#article-frame');
const directLink = document.querySelector('#article-direct-link');
const articleButtons = [...document.querySelectorAll('[data-article-src]')];

function resizeArticleFrame() {
  try {
    const doc = articleFrame.contentDocument;
    if (!doc) return;
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
  new ResizeObserver(resizeArticleFrame).observe(doc.documentElement);
});

window.addEventListener('resize', resizeArticleFrame);
