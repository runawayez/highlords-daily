const STORAGE_KEY = 'highlords:article-state:v1';

const state = {
  categories: [],
  feeds: [],
  edition: null,
  articles: [],
  health: null,
  activeView: localStorage.getItem('highlords:view') || 'home',
  activeFilter: localStorage.getItem('highlords:filter') || 'all',
  query: '',
  articleState: loadArticleState()
};

const el = id => document.getElementById(id);
const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
});
const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
});

el('dateLabel').textContent = dateFmt.format(new Date()).toUpperCase();

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body != null && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
  return body;
}

function loadArticleState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function persistArticleState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.articleState));
}

function stateFor(articleOrId) {
  const id = String(typeof articleOrId === 'object' ? articleOrId?.id : articleOrId);
  return state.articleState[id] || {};
}

function patchArticleState(id, patch) {
  const key = String(id);
  state.articleState[key] = { ...(state.articleState[key] || {}), ...patch };
  if (!state.articleState[key].savedAt && !state.articleState[key].readAt && !state.articleState[key].dismissedAt) {
    delete state.articleState[key];
  }
  persistArticleState();
  updateSavedCount();
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}

function proxiedImage(value) {
  if (!value) return '';
  const safe = safeUrl(value);
  return safe === '#' ? '' : `/api/image?url=${encodeURIComponent(safe)}`;
}

function relativeDate(value) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 2) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

function categoryName(article) {
  return state.categories.find(category => category.slug === article?.category)?.name || article?.category || 'Destaque';
}

function categoryColor(article) {
  const palette = {
    brasil: '#ff3b30',
    mundo: '#ff7a45',
    tecnologia: '#4d8dff',
    ia: '#a675ff',
    games: '#ff4f87',
    ciencia: '#33c39b',
    'qa-dev': '#49b96f'
  };
  return palette[article?.category] || '#ff3b30';
}

function storyTitle(article) {
  return escapeHtml(article?.headline || article?.originalTitle || 'Sem título');
}

function storyLink(article) {
  return escapeHtml(safeUrl(article?.link));
}

function kickerMarkup(article, suffix = '') {
  return `<span class="story-kicker"><i class="category-dot" style="--category-color:${categoryColor(article)}"></i>${escapeHtml(categoryName(article))}${suffix ? ` · ${escapeHtml(suffix)}` : ''}</span>`;
}

function articleMeta(article) {
  const score = Number(article?.score || 0).toFixed(1);
  return `<div class="story-meta">
    <span class="source-name">${escapeHtml(article?.source || '')}</span>
    <span>${escapeHtml(relativeDate(article?.publishedAt))}</span>
    <span class="meta-score" title="Relevância editorial">${score}</span>
  </div>`;
}

function imageMarkup(article, className) {
  const src = proxiedImage(article?.imageUrl);
  if (!src) return '';
  const score = Number(article?.score || 0).toFixed(1);
  return `<div class="${className} story-media-frame" data-media>
    <img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" data-story-image />
    <span class="score-chip" title="Relevância editorial">${score}</span>
  </div>`;
}

function hydrateImages(root = document) {
  root.querySelectorAll('img[data-story-image]').forEach(img => {
    if (img.dataset.hydrated) return;
    img.dataset.hydrated = '1';
    const container = img.closest('[data-media]');
    const card = img.closest('.hero-card, .hero-mini, .story-card, .collection-card');
    const reject = () => {
      container?.remove();
      card?.classList.add('no-media');
    };
    img.addEventListener('error', reject, { once: true });
    if (img.complete && !img.naturalWidth) queueMicrotask(reject);
  });
}

function byScore(a, b) {
  const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
  if (scoreDiff) return scoreDiff;
  return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
}

function byRecent(a, b) {
  return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
}

function uniqueArticles(items) {
  const seen = new Set();
  return items.filter(article => {
    if (!article || seen.has(article.id)) return false;
    seen.add(article.id);
    return true;
  });
}

function homeArticles() {
  return state.articles.filter(article => {
    const itemState = stateFor(article);
    return !itemState.readAt && !itemState.dismissedAt;
  });
}

function savedArticles() {
  return state.articles
    .filter(article => stateFor(article).savedAt)
    .sort((a, b) => new Date(stateFor(b).savedAt) - new Date(stateFor(a).savedAt));
}

function historyArticles() {
  return state.articles
    .filter(article => stateFor(article).readAt || stateFor(article).dismissedAt)
    .sort((a, b) => {
      const aDate = stateFor(a).readAt || stateFor(a).dismissedAt || 0;
      const bDate = stateFor(b).readAt || stateFor(b).dismissedAt || 0;
      return new Date(bDate) - new Date(aDate);
    });
}

function baseArticlesForView() {
  if (state.activeView === 'saved') return savedArticles();
  if (state.activeView === 'history') return historyArticles();
  return homeArticles();
}

function matchesSearch(article) {
  const query = state.query.trim().toLocaleLowerCase('pt-BR');
  if (!query) return true;
  const haystack = [
    article.headline,
    article.originalTitle,
    article.summary,
    article.excerpt,
    article.source,
    categoryName(article),
    ...(Array.isArray(article.tags) ? article.tags : [])
  ].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
  return haystack.includes(query);
}

function filteredArticles() {
  let items = baseArticlesForView();
  if (state.activeFilter !== 'all') items = items.filter(article => article.category === state.activeFilter);
  return uniqueArticles(items.filter(matchesSearch));
}

function selectHero(items) {
  if (!items.length) return null;
  if (state.activeView === 'home' && state.activeFilter === 'all' && !state.query && state.edition?.lead) {
    const curated = items.find(article => article.id === state.edition.lead.id);
    if (curated) return curated;
  }
  return [...items].sort(byScore)[0] || items[0];
}

function actionButtons(article, { compact = false } = {}) {
  const itemState = stateFor(article);
  const saved = Boolean(itemState.savedAt);
  const read = Boolean(itemState.readAt);
  const dismissed = Boolean(itemState.dismissedAt);
  const labels = compact
    ? {
        save: saved ? 'Salva' : 'Salvar',
        read: read ? 'Não lida' : 'Lida',
        dismiss: dismissed ? 'Restaurar' : 'Ocultar'
      }
    : {
        save: saved ? 'Remover de Ler depois' : 'Ler depois',
        read: read ? 'Marcar como não lida' : 'Marcar como lida',
        dismiss: dismissed ? 'Restaurar na edição' : 'Ocultar'
      };

  return `<div class="story-actions ${compact ? 'compact' : ''}">
    <button class="story-action ${saved ? 'active' : ''}" data-action="save" data-id="${article.id}" type="button" title="${labels.save}">${labels.save}</button>
    <button class="story-action ${read ? 'active' : ''}" data-action="read" data-id="${article.id}" type="button" title="${labels.read}">${labels.read}</button>
    <button class="story-action danger ${dismissed ? 'active' : ''}" data-action="dismiss" data-id="${article.id}" type="button" title="${labels.dismiss}">${labels.dismiss}</button>
  </div>`;
}

function renderHero(article) {
  const hero = el('hero');
  if (!article) {
    hero.innerHTML = '';
    hero.classList.add('no-media');
    return;
  }
  const media = imageMarkup(article, 'hero-media');
  hero.classList.toggle('no-media', !media);
  hero.innerHTML = `
    ${media ? `<a class="story-link" data-story-id="${article.id}" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">${media}</a>` : ''}
    <div class="hero-body">
      ${kickerMarkup(article, 'MANCHETE')}
      <a class="story-link" data-story-id="${article.id}" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
        <h2 class="hero-title">${storyTitle(article)}</h2>
      </a>
      <p class="hero-summary">${escapeHtml(article.summary || article.excerpt || '')}</p>
      <div class="hero-footer">
        ${articleMeta(article)}
        ${actionButtons(article, { compact: true })}
      </div>
    </div>`;
}

function renderHeroMini(article) {
  const media = imageMarkup(article, 'mini-media');
  return `<article class="hero-mini ${media ? '' : 'no-media'}">
    ${media ? `<a class="story-link" data-story-id="${article.id}" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">${media}</a>` : ''}
    <div class="mini-copy">
      ${kickerMarkup(article)}
      <a class="story-link" data-story-id="${article.id}" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
        <h3>${storyTitle(article)}</h3>
      </a>
      ${articleMeta(article)}
      ${actionButtons(article, { compact: true })}
    </div>
  </article>`;
}

function renderStoryCard(article) {
  const media = imageMarkup(article, 'story-media');
  return `<article class="story-card ${media ? '' : 'no-media'}">
    ${media ? `<a class="story-link" data-story-id="${article.id}" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">${media}</a>` : ''}
    <div class="story-body">
      ${kickerMarkup(article)}
      <a class="story-link" data-story-id="${article.id}" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
        <h3 class="story-title">${storyTitle(article)}</h3>
      </a>
      <p class="story-summary">${escapeHtml(article.summary || article.excerpt || '')}</p>
      <div class="story-card-foot">
        ${articleMeta(article)}
        ${actionButtons(article, { compact: true })}
      </div>
    </div>
  </article>`;
}

function renderRailItem(article) {
  return `<article class="rail-item">
    ${kickerMarkup(article)}
    <a class="story-link" data-story-id="${article.id}" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
      <h3>${storyTitle(article)}</h3>
    </a>
    ${articleMeta(article)}
    ${actionButtons(article, { compact: true })}
  </article>`;
}

function renderCollectionCard(article) {
  const media = imageMarkup(article, 'collection-media');
  const itemState = stateFor(article);
  const historyLabel = itemState.dismissedAt && !itemState.readAt ? 'Ocultada' : itemState.readAt ? 'Lida' : 'Salva';
  return `<article class="collection-card ${media ? '' : 'no-media'}">
    ${media ? `<a class="story-link" data-story-id="${article.id}" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">${media}</a>` : ''}
    <div class="collection-body">
      ${kickerMarkup(article)}
      <a class="story-link" data-story-id="${article.id}" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
        <h3>${storyTitle(article)}</h3>
      </a>
      <p>${escapeHtml(article.summary || article.excerpt || '')}</p>
      <div class="collection-meta-row">
        ${articleMeta(article)}
        <span class="state-label">${historyLabel}</span>
      </div>
      ${actionButtons(article, { compact: true })}
    </div>
  </article>`;
}

function renderHome() {
  const items = filteredArticles();
  const hero = selectHero(items);
  const ranked = [...items].sort(byScore).filter(article => article.id !== hero?.id);
  const heroSide = ranked.slice(0, 3);
  const used = new Set([hero?.id, ...heroSide.map(article => article.id)].filter(Boolean));
  const recent = [...items].sort(byRecent).filter(article => !used.has(article.id));
  const latest = recent.slice(0, 9);
  latest.forEach(article => used.add(article.id));
  const earlier = [...items].sort(byRecent).filter(article => !used.has(article.id)).slice(0, 14);

  renderHero(hero);
  el('heroSide').innerHTML = heroSide.map(renderHeroMini).join('');
  el('storyGrid').innerHTML = latest.map(renderStoryCard).join('');
  el('earlierList').innerHTML = earlier.map(renderRailItem).join('');
  el('earlierSection').classList.toggle('hidden', !earlier.length);

  const sourceCount = new Set(items.map(article => article.source)).size;
  el('editionCount').textContent = `${items.length} notícia${items.length === 1 ? '' : 's'}`;
  el('statArticles').textContent = items.length;
  el('statSources').textContent = sourceCount;
  el('statMode').textContent = state.edition?.curatedBy === 'ollama' ? 'IA local' : 'Ranking';

  const hasContent = Boolean(items.length);
  el('homeView').classList.toggle('hidden', !hasContent);
  el('collectionView').classList.add('hidden');
  toggleWelcome(!hasContent);
}

function renderCollection() {
  const items = filteredArticles();
  el('homeView').classList.add('hidden');
  el('collectionView').classList.toggle('hidden', !items.length);
  el('collectionGrid').innerHTML = items.map(renderCollectionCard).join('');
  el('collectionCount').textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
  el('clearHistoryBtn').classList.toggle('hidden', state.activeView !== 'history' || !items.length);
  toggleWelcome(!items.length);
}

function toggleWelcome(show) {
  el('welcome').classList.toggle('hidden', !show);
  if (!show) return;
  const running = Boolean(state.health?.refresh?.running);
  if (state.query) {
    el('welcomeTitle').textContent = 'Nada encontrado.';
    el('welcomeCopy').textContent = `Nenhuma notícia corresponde a “${state.query}”.`;
  } else if (state.activeView === 'saved') {
    el('welcomeTitle').textContent = 'Sua lista está vazia.';
    el('welcomeCopy').textContent = 'Use “Salvar” nos cards para guardar matérias e ler depois.';
  } else if (state.activeView === 'history') {
    el('welcomeTitle').textContent = 'Seu histórico está vazio.';
    el('welcomeCopy').textContent = 'As matérias que você abrir ou ocultar aparecem aqui.';
  } else if (running) {
    el('welcomeTitle').textContent = 'Sua edição está sendo preparada.';
    el('welcomeCopy').textContent = 'O Ollama está classificando e resumindo as notícias.';
  } else {
    el('welcomeTitle').textContent = 'Não há notícias não lidas nesta visualização.';
    el('welcomeCopy').innerHTML = 'Troque de categoria ou clique em <strong>Atualizar</strong> para buscar novas notícias.';
  }
}

function updatePageHeading() {
  const titleMap = {
    home: ['Sua edição', 'As notícias que importam, organizadas localmente.'],
    saved: ['Ler depois', 'Matérias que você separou para voltar com calma.'],
    history: ['Histórico', 'Tudo o que você já abriu ou tirou da edição.']
  };
  const [title, description] = titleMap[state.activeView] || titleMap.home;
  el('viewTitle').textContent = state.query ? `Resultados para “${state.query}”` : title;
  el('viewDescription').textContent = state.query ? 'Pesquisa local por título, resumo, fonte e categoria.' : description;
}

function enabledCategories() {
  return state.categories.filter(category => category.enabled);
}

function categoryCountsForCurrentView() {
  const counts = new Map();
  for (const article of baseArticlesForView()) {
    if (!article.category) continue;
    counts.set(article.category, (counts.get(article.category) || 0) + 1);
  }
  return counts;
}

function normalizeFilter() {
  const counts = categoryCountsForCurrentView();
  if (state.activeFilter !== 'all' && !counts.get(state.activeFilter)) state.activeFilter = 'all';
  localStorage.setItem('highlords:filter', state.activeFilter);
}

function renderCategories() {
  normalizeFilter();
  const counts = categoryCountsForCurrentView();
  const categories = enabledCategories().filter(category => (counts.get(category.slug) || 0) > 0);
  el('categoryBar').innerHTML = `
    <button class="category-chip ${state.activeFilter === 'all' ? 'active' : ''}" data-filter="all">Todos <span>${baseArticlesForView().length}</span></button>
    ${categories.map(category => `<button class="category-chip ${state.activeFilter === category.slug ? 'active' : ''}" data-filter="${escapeHtml(category.slug)}"><i class="category-dot" style="--category-color:${categoryColor({ category: category.slug })}"></i>${escapeHtml(category.name)} <span>${counts.get(category.slug)}</span></button>`).join('')}`;

  el('categoryBar').querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeFilter = button.dataset.filter || 'all';
      localStorage.setItem('highlords:filter', state.activeFilter);
      renderAll();
    });
  });
}

function updateSavedCount() {
  const count = savedArticles().length;
  el('savedCount').textContent = count;
  el('savedCount').classList.toggle('hidden', count === 0);
}

function renderNav() {
  document.querySelectorAll('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === state.activeView);
  });
}

function renderAll() {
  updatePageHeading();
  renderNav();
  renderCategories();
  updateSavedCount();
  if (state.activeView === 'home') renderHome();
  else renderCollection();
  requestAnimationFrame(() => hydrateImages(document));
}

function showToast(message) {
  const toast = el('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 1800);
}

function articleById(id) {
  return state.articles.find(article => article.id === Number(id));
}

function handleAction(action, id) {
  const article = articleById(id);
  if (!article) return;
  const now = new Date().toISOString();
  const itemState = stateFor(article);

  if (action === 'save') {
    patchArticleState(article.id, { savedAt: itemState.savedAt ? null : now });
    showToast(itemState.savedAt ? 'Removido de Ler depois.' : 'Salvo para ler depois.');
  } else if (action === 'read') {
    patchArticleState(article.id, { readAt: itemState.readAt ? null : now });
    showToast(itemState.readAt ? 'Marcada como não lida.' : 'Marcada como lida.');
  } else if (action === 'dismiss') {
    patchArticleState(article.id, { dismissedAt: itemState.dismissedAt ? null : now });
    showToast(itemState.dismissedAt ? 'Notícia restaurada.' : 'Notícia ocultada da edição.');
  }
  renderAll();
}

async function loadContent() {
  el('loading').classList.remove('hidden');
  el('errorBox').classList.add('hidden');
  try {
    const [edition, articles] = await Promise.all([
      api('/api/edition'),
      api('/api/articles?limit=200')
    ]);
    state.edition = edition;
    state.articles = Array.isArray(articles) ? articles : [];
    renderAll();
  } catch (error) {
    el('errorBox').textContent = error.message;
    el('errorBox').classList.remove('hidden');
  } finally {
    el('loading').classList.add('hidden');
  }
}

function resetCategoryForm() {
  const form = el('categoryForm');
  form.reset();
  form.elements.id.value = '';
  form.elements.enabled.checked = true;
  el('categoryFormTitle').textContent = 'Categorias';
  el('categorySubmit').textContent = 'Criar categoria';
  el('cancelCategoryEdit').classList.add('hidden');
  el('categoryEnabledRow').classList.add('hidden');
}

function startCategoryEdit(category) {
  const form = el('categoryForm');
  form.elements.id.value = category.id;
  form.elements.name.value = category.name;
  form.elements.description.value = category.description || '';
  form.elements.enabled.checked = category.enabled;
  el('categoryFormTitle').textContent = `Editar ${category.name}`;
  el('categorySubmit').textContent = 'Salvar alterações';
  el('cancelCategoryEdit').classList.remove('hidden');
  el('categoryEnabledRow').classList.remove('hidden');
  form.elements.name.focus();
}

function renderSettings() {
  el('feedCount').textContent = `${state.feeds.length} fontes`;
  el('categoryCount').textContent = `${enabledCategories().length} ativas`;

  el('feedsList').innerHTML = state.feeds.length
    ? state.feeds.map(feed => `<div class="settings-item">
        <div class="settings-item-copy">
          <strong>${escapeHtml(feed.name)}</strong>
          <small>${escapeHtml(feed.url)}</small>
          ${feed.lastError ? `<small class="item-error">${escapeHtml(feed.lastError)}</small>` : ''}
        </div>
        <button class="text-button danger" data-delete-feed="${feed.id}" type="button">Remover</button>
      </div>`).join('')
    : '<p class="last-run">Nenhuma fonte adicionada.</p>';

  el('categoriesList').innerHTML = state.categories.map(category => `<div class="settings-item ${category.enabled ? '' : 'disabled-item'}" data-slug="${escapeHtml(category.slug)}">
      <div class="settings-item-copy">
        <div class="item-title-row"><strong>${escapeHtml(category.name)}</strong>${category.enabled ? '' : '<span class="mini-badge">pausada</span>'}</div>
        <small>${escapeHtml(category.description || 'Sem descrição')}</small>
      </div>
      <div class="item-actions">
        <button class="text-button" data-edit-category="${category.id}" type="button">Editar</button>
        <button class="text-button danger" data-delete-category="${category.id}" type="button">Remover</button>
      </div>
    </div>`).join('');

  document.querySelectorAll('[data-delete-feed]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Remover esta fonte?')) return;
    await api(`/api/feeds/${button.dataset.deleteFeed}`, { method: 'DELETE' });
    await loadBootstrap();
  }));

  document.querySelectorAll('[data-edit-category]').forEach(button => button.addEventListener('click', () => {
    const category = state.categories.find(item => item.id === Number(button.dataset.editCategory));
    if (category) startCategoryEdit(category);
  }));

  document.querySelectorAll('[data-delete-category]').forEach(button => button.addEventListener('click', async () => {
    const item = button.closest('.settings-item');
    const name = item?.querySelector('strong')?.textContent || 'esta categoria';
    if (!confirm(`Remover ${name}? As matérias dessa seção precisarão ser reprocessadas.`)) return;
    await api(`/api/categories/${button.dataset.deleteCategory}`, { method: 'DELETE' });
    resetCategoryForm();
    await loadBootstrap();
  }));
}

function refreshPresentation(refresh) {
  const running = Boolean(refresh?.running);
  const p = refresh?.progress || {};
  const stage = p.stage || 'idle';
  el('refreshPanel').classList.toggle('hidden', !running);

  let label = 'Atualizando';
  let detail = '';
  let percent = 6;

  if (stage === 'collecting') {
    label = 'Coletando fontes';
    detail = `${p.feedsDone || 0}/${p.feedsTotal || 0} feeds · ${p.discovered || 0} novas`;
    percent = p.feedsTotal ? 8 + ((p.feedsDone || 0) / p.feedsTotal) * 22 : 10;
  } else if (stage === 'analyzing') {
    const completed = Number(p.processed || 0) + Number(p.failed || 0);
    label = 'Analisando notícias';
    detail = `${completed}/${p.queueTotal || 0}${p.currentSource ? ` · ${p.currentSource}` : ''}`;
    percent = p.queueTotal ? 30 + (completed / p.queueTotal) * 58 : 84;
  } else if (stage === 'curating') {
    label = 'Montando a edição';
    detail = 'Escolhendo manchete e destaques';
    percent = 94;
  }

  el('refreshStage').textContent = label;
  el('refreshDetail').textContent = detail;
  el('refreshBar').style.width = `${Math.min(100, Math.max(0, percent))}%`;

  const button = el('refreshBtn');
  button.disabled = running;
  if (running) {
    button.innerHTML = '<span class="button-spinner" aria-hidden="true"></span> Atualizando';
  } else {
    const backlog = Number(refresh?.lastRun?.backlog || 0);
    button.textContent = backlog > 0 ? `Continuar · ${backlog}` : 'Atualizar';
  }
}

async function loadHealth() {
  try {
    const health = await api('/api/health');
    state.health = health;
    const status = el('ollamaStatus');
    status.classList.toggle('ok', health.ollama.ok);
    status.classList.toggle('bad', !health.ollama.ok);
    status.textContent = health.ollama.ok
      ? `${health.ollama.model}${health.ollama.modelAvailable ? '' : ' · ausente'}`
      : 'Ollama offline';
    refreshPresentation(health.refresh);

    const run = health.refresh?.lastRun;
    if (run) {
      const backlog = Number(run.backlog || 0);
      el('lastRun').textContent = `${timeFmt.format(new Date(run.finishedAt))} · ${run.processed} analisadas${backlog ? ` · ${backlog} na fila` : ''}`;
    } else {
      el('lastRun').textContent = 'Ainda sem atualização';
    }
    el('editorStatus').textContent = state.edition?.curatedBy === 'ollama' ? 'Curadoria por IA local' : 'Curadoria por relevância';
  } catch {
    el('ollamaStatus').classList.add('bad');
    el('ollamaStatus').textContent = 'Servidor indisponível';
  }
}

async function loadBootstrap() {
  [state.categories, state.feeds] = await Promise.all([api('/api/categories'), api('/api/feeds')]);
  renderSettings();
  await loadHealth();
  await loadContent();
}

async function pollRefresh() {
  for (let i = 0; i < 1800; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 900));
    const status = await api('/api/refresh/status');
    refreshPresentation(status);
    if (!status.running) {
      await loadBootstrap();
      return;
    }
  }
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  if (action) {
    event.preventDefault();
    event.stopPropagation();
    handleAction(action.dataset.action, action.dataset.id);
    return;
  }

  const storyLinkEl = event.target.closest('a[data-story-id]');
  if (storyLinkEl) {
    const article = articleById(storyLinkEl.dataset.storyId);
    if (article) patchArticleState(article.id, { readAt: new Date().toISOString() });
  }
});

document.querySelectorAll('[data-view]').forEach(button => {
  button.addEventListener('click', () => {
    state.activeView = button.dataset.view || 'home';
    state.activeFilter = 'all';
    localStorage.setItem('highlords:view', state.activeView);
    localStorage.setItem('highlords:filter', state.activeFilter);
    renderAll();
  });
});

el('searchInput').addEventListener('input', event => {
  state.query = event.currentTarget.value || '';
  renderAll();
});

document.addEventListener('keydown', event => {
  if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    event.preventDefault();
    el('searchInput').focus();
  }
  if (event.key === 'Escape' && document.activeElement === el('searchInput')) {
    el('searchInput').value = '';
    state.query = '';
    el('searchInput').blur();
    renderAll();
  }
});

el('clearHistoryBtn').addEventListener('click', () => {
  if (!confirm('Limpar seu histórico de leitura? Itens salvos em Ler depois serão mantidos.')) return;
  for (const [id, value] of Object.entries(state.articleState)) {
    state.articleState[id] = { ...value, readAt: null, dismissedAt: null };
    if (!state.articleState[id].savedAt) delete state.articleState[id];
  }
  persistArticleState();
  renderAll();
});

el('refreshBtn').addEventListener('click', async () => {
  try {
    el('errorBox').classList.add('hidden');
    await api('/api/refresh', { method: 'POST' });
    await loadHealth();
    pollRefresh().catch(console.error);
  } catch (error) {
    el('errorBox').textContent = error.message;
    el('errorBox').classList.remove('hidden');
  }
});

const dialog = el('settingsDialog');
el('settingsBtn').addEventListener('click', () => dialog.showModal());
document.querySelectorAll('[data-open-settings]').forEach(button => button.addEventListener('click', () => dialog.showModal()));
el('closeSettings').addEventListener('click', () => dialog.close());
el('cancelCategoryEdit').addEventListener('click', resetCategoryForm);
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

el('feedForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    state.feeds = await api('/api/feeds', {
      method: 'POST',
      body: JSON.stringify({ name: form.get('name'), url: form.get('url') })
    });
    event.currentTarget.reset();
    renderSettings();
  } catch (error) {
    alert(error.message);
  }
});

el('categoryForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = form.get('id');
  try {
    state.categories = await api(id ? `/api/categories/${id}` : '/api/categories', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify({
        name: form.get('name'),
        description: form.get('description'),
        ...(id ? { enabled: form.get('enabled') === 'on' } : {})
      })
    });
    resetCategoryForm();
    renderSettings();
    renderAll();
  } catch (error) {
    alert(error.message);
  }
});

loadBootstrap().catch(error => {
  el('errorBox').textContent = error.message;
  el('errorBox').classList.remove('hidden');
});

setInterval(loadHealth, 10000);