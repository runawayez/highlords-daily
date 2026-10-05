const categoryBar = document.getElementById('categoryBar');
let categoryCounts = new Map();
let refreshTimer = null;

function countArticles(articles) {
  const counts = new Map();
  for (const article of Array.isArray(articles) ? articles : []) {
    const slug = article?.category;
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  return counts;
}

function applyCategoryVisibility() {
  if (!categoryBar) return;

  let activeCategoryIsEmpty = false;
  categoryBar.querySelectorAll('[data-filter]').forEach(button => {
    const slug = button.dataset.filter;
    if (!slug || slug === 'all') {
      button.hidden = false;
      return;
    }

    const count = categoryCounts.get(slug) || 0;
    button.hidden = count === 0;
    button.title = count ? `${count} matéria${count === 1 ? '' : 's'}` : '';

    if (count === 0 && button.classList.contains('active')) {
      activeCategoryIsEmpty = true;
    }
  });

  if (activeCategoryIsEmpty) {
    categoryBar.querySelector('[data-filter="all"]')?.click();
  }
}

async function refreshCategoryCounts() {
  try {
    const response = await fetch('/api/articles?limit=200', { cache: 'no-store' });
    if (!response.ok) return;
    categoryCounts = countArticles(await response.json());
    applyCategoryVisibility();
  } catch {
    // A navegação principal continua funcional mesmo se a contagem falhar.
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshCategoryCounts, 120);
}

if (categoryBar) {
  new MutationObserver(() => {
    applyCategoryVisibility();
    scheduleRefresh();
  }).observe(categoryBar, { childList: true });
}

refreshCategoryCounts();
setInterval(refreshCategoryCounts, 10000);
