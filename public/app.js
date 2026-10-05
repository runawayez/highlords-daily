const state = {
  categories: [],
  activeFilter: localStorage.getItem('highlords:filter') || 'all',
  feeds: [],
  edition: null,
  articles: [],
  health: null
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
  const ms = Math.max(0, Date.now() - timestamp);
  const minutes = Math.round(ms / 60_000);
  if (minutes < 2) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

function categoryName(article) {
  return state.categories.find(category => category.slug === article?.category)?.name || article?.category || 'Destaque';
}

function storyTitle(article) {
  return escapeHtml(article?.headline || article?.originalTitle || 'Sem título');
}

function storyLink(article) {
  return escapeHtml(safeUrl(article?.link));
}

function articleMeta(article) {
  const score = Number(article?.score || 0).toFixed(1);
  return `<div class="story-meta">
    <span class="source-name">${escapeHtml(article?.source || '')}</span>
    <span>${escapeHtml(relativeDate(article?.publishedAt))}</span>
    <span class="relevance" title="Relevância editorial">${score}</span>
  </div>`;
}

function imageMarkup(article, className) {
  const src = proxiedImage(article?.imageUrl);
  if (!src) return '';
  return `<div class="${className}" data-media>
    <img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" data-story-image />
  </div>`;
}

function hydrateImages(root = document) {
  root.querySelectorAll('img[data-story-image]').forEach(img => {
    if (img.dataset.hydrated) return;
    img.dataset.hydrated = '1';
    const container = img.closest('[data-media]');
    const card = img.closest('.hero-card, .story-card, .earlier-item');

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

function filteredArticles() {
  const items = state.activeFilter === 'all'
    ? state.articles
    : state.articles.filter(article => article.category === state.activeFilter);
  return uniqueArticles(items);
}

function selectHero(items) {
  if (!items.length) return null;
  if (state.activeFilter === 'all' && state.edition?.lead) {
    const curated = items.find(article => article.id === state.edition.lead.id);
    if (curated) return curated;
  }
  return [...items].sort(byScore)[0] || items[0];
}

function renderHero(article) {
  const hero = el('hero');
  if (!article) {
    hero.innerHTML = '';
    hero.classList.add('no-media');
    return;
  }

  const media = imageMarkup(article, 'hero-media-wrap');
  hero.classList.toggle('no-media', !media);
  hero.innerHTML = `
    ${media ? `<a class="story-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">${media}</a>` : ''}
    <div class="hero-body">
      <span class="hero-kicker">${escapeHtml(categoryName(article))} · MANCHETE</span>
      <a class="story-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
        <h2 class="hero-title">${storyTitle(article)}</h2>
      </a>
      <p class="hero-summary">${escapeHtml(article.summary || article.excerpt || '')}</p>
      <div class="hero-footer">
        ${articleMeta(article)}
        <a class="read-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">Ler matéria <span>↗</span></a>
      </div>
    </div>`;
}

function renderLatest(article, index) {
  return `<article class="latest-item">
    <div class="latest-item-head">
      <span class="story-kicker">${escapeHtml(categoryName(article))}</span>
      <span class="latest-index">${String(index + 1).padStart(2, '0')}</span>
    </div>
    <a class="story-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
      <h3 class="latest-title">${storyTitle(article)}</h3>
    </a>
    ${articleMeta(article)}
  </article>`;
}

function renderCard(article) {
  const media = imageMarkup(article, 'story-media');
  return `<article class="story-card ${media ? '' : 'no-media'}">
    ${media ? `<a class="story-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">${media}</a>` : ''}
    <div class="story-body">
      <span class="story-kicker">${escapeHtml(categoryName(article))}</span>
      <a class="story-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
        <h3 class="story-title">${storyTitle(article)}</h3>
      </a>
      <p class="story-summary">${escapeHtml(article.summary || article.excerpt || '')}</p>
      ${articleMeta(article)}
    </div>
  </article>`;
}

function renderEarlier(article) {
  const media = imageMarkup(article, 'earlier-thumb');
  return `<article class="earlier-item ${media ? '' : 'no-media'}">
    <div>
      <span class="story-kicker">${escapeHtml(categoryName(article))}</span>
      <a class="story-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
        <h3 class="earlier-title">${storyTitle(article)}</h3>
      </a>
      ${articleMeta(article)}
    </div>
    ${media ? `<a class="story-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">${media}</a>` : ''}
  </article>`;
}

function renderDashboard() {
  const items = filteredArticles();
  const hero = selectHero(items);
  const recent = [...items].sort(byRecent).filter(article => article.id !== hero?.id);
  const latest = recent.slice(0, 4);
  const used = new Set([hero?.id, ...latest.map(article => article.id)].filter(Boolean));
  const featured = [...items].sort(byScore).filter(article => !used.has(article.id)).slice(0, 6);
  featured.forEach(article => used.add(article.id));
  const earlier = recent.filter(article => !used.has(article.id)).slice(0, 12);

  renderHero(hero);
  el('latestList').innerHTML = latest.length
    ? latest.map(renderLatest).join('')
    : '<p class="last-run">Sem outras matérias nesta categoria.</p>';
  el('storyGrid').innerHTML = featured.map(renderCard).join('');
  el('earlierList').innerHTML = earlier.map(renderEarlier).join('');
  el('earlierSection').classList.toggle('hidden', !earlier.length);

  const sourceCount = new Set(items.map(article => article.source)).size;
  el('editionCount').textContent = `${items.length} matéria${items.length === 1 ? '' : 's'}`;
  el('statArticles').textContent = items.length;
  el('statSources').textContent = sourceCount;
  el('statMode').textContent = state.edition?.curatedBy === 'ollama' ? 'Curadoria IA local' : 'Ranking local';
  el('editorStatus').textContent = state.edition?.curatedBy === 'ollama' ? 'Curadoria por IA local' : 'Curadoria por relevância';

  const hasContent = Boolean(items.length);
  el('edition').classList.toggle('hidden', !hasContent);
  el('welcome').classList.toggle('hidden', hasContent);

  if (!hasContent) {
    const running = Boolean(state.health?.refresh?.running);
    el('welcomeTitle').textContent = running ? 'Sua edição está sendo preparada.' : 'Nenhuma matéria nesta visualização.';
    el('welcomeCopy').innerHTML = running
      ? 'O Ollama está classificando e resumindo as notícias. Esta tela atualiza quando o processamento terminar.'
      : 'Troque de categoria ou clique em <strong>Atualizar</strong> para buscar novas notícias.';
  }

  requestAnimationFrame(() => hydrateImages(el('edition')));
}

function enabledCategories() {
  return state.categories.filter(category => category.enabled);
}

function normalizeFilter() {
  const valid = new Set(enabledCategories().map(category => category.slug));
  if (state.activeFilter !== 'all' && !valid.has(state.activeFilter)) state.activeFilter = 'all';
  localStorage.setItem('highlords:filter', state.activeFilter);
}

function renderCategories() {
  normalizeFilter();
  el('categoryBar').innerHTML = `
    <button class="category-chip ${state.activeFilter === 'all' ? 'active' : ''}" data-filter="all">Todos</button>
    ${enabledCategories().map(category => `<button class="category-chip ${state.activeFilter === category.slug ? 'active' : ''}" data-filter="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</button>`).join('')}`;

  el('categoryBar').querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeFilter = button.dataset.filter || 'all';
      localStorage.setItem('highlords:filter', state.activeFilter);
      renderCategories();
      renderDashboard();
    });
  });
}

async function loadContent() {
  el('loading').classList.remove('hidden');
  el('errorBox').classList.add('hidden');
  try {
    const [edition, articles] = await Promise.all([
      api('/api/edition'),
      api('/api/articles?limit=120')
    ]);
    state.edition = edition;
    state.articles = Array.isArray(articles) ? articles : [];
    renderDashboard();
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
        <button class="text-button danger" data-delete-feed="${feed.id}">Remover</button>
      </div>`).join('')
    : '<p class="last-run">Nenhuma fonte adicionada.</p>';

  el('categoriesList').innerHTML = state.categories.map(category => `<div class="settings-item ${category.enabled ? '' : 'disabled-item'}" data-slug="${escapeHtml(category.slug)}">
      <div class="settings-item-copy">
        <div class="item-title-row"><strong>${escapeHtml(category.name)}</strong>${category.enabled ? '' : '<span class="mini-badge">pausada</span>'}</div>
        <small>${escapeHtml(category.description || 'Sem descrição')}</small>
      </div>
      <div class="item-actions">
        <button class="text-button" data-edit-category="${category.id}">Editar</button>
        <button class="text-button danger" data-delete-category="${category.id}">Remover</button>
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
    if (state.activeFilter === item?.dataset?.slug) state.activeFilter = 'all';
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
  } catch {
    el('ollamaStatus').classList.add('bad');
    el('ollamaStatus').textContent = 'Servidor indisponível';
  }
}

async function loadBootstrap() {
  [state.categories, state.feeds] = await Promise.all([api('/api/categories'), api('/api/feeds')]);
  normalizeFilter();
  renderCategories();
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
    normalizeFilter();
    renderCategories();
    renderSettings();
    renderDashboard();
  } catch (error) {
    alert(error.message);
  }
});

loadBootstrap().catch(error => {
  el('errorBox').textContent = error.message;
  el('errorBox').classList.remove('hidden');
});

setInterval(loadHealth, 10000);
