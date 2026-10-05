const state = {
  categories: [],
  selected: new Set(JSON.parse(localStorage.getItem('highlords:selected') || '[]')),
  feeds: [],
  edition: null,
  health: null
};

const el = id => document.getElementById(id);
const dateFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

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
  const days = Math.round(hours / 24);
  return `há ${days}d`;
}

function categoryName(article) {
  return state.categories.find(category => category.slug === article?.category)?.name || article?.category || 'Destaque';
}

function articleMeta(article, compact = false) {
  const score = Number(article.score || 0).toFixed(1);
  return `<div class="story-meta ${compact ? 'compact' : ''}">
    <span class="source-name">${escapeHtml(article.source)}</span>
    <span>${relativeDate(article.publishedAt)}</span>
    <span class="score-chip">${score}</span>
  </div>`;
}

function media(article, className = '') {
  const image = article?.imageUrl;
  return `<div class="story-media ${className} ${image ? 'has-image' : ''}">
    ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.classList.remove('has-image');this.remove()" />` : ''}
    <div class="media-fallback">
      <img src="/assets/highlords-logo.svg" alt="" />
      <span>${escapeHtml(categoryName(article))}</span>
    </div>
  </div>`;
}

function renderLead(article) {
  if (!article) return '';
  return `
    ${media(article, 'lead-media')}
    <div class="lead-copy">
      <div class="story-kicker"><span>${escapeHtml(categoryName(article))}</span><span>MANCHETE</span></div>
      <a class="story-link" href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">
        <h1>${escapeHtml(article.headline || article.originalTitle)}</h1>
      </a>
      <p class="lead-summary">${escapeHtml(article.summary || article.excerpt || '')}</p>
      ${articleMeta(article)}
      <a class="read-link" href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">Abrir matéria <span>↗</span></a>
    </div>
  `;
}

function renderHighlight(article, index) {
  return `<article class="highlight-item">
    <span class="highlight-index">${String(index + 1).padStart(2, '0')}</span>
    <div class="highlight-copy">
      <span class="story-kicker single">${escapeHtml(categoryName(article))}</span>
      <a class="story-link" href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">
        <h3>${escapeHtml(article.headline || article.originalTitle)}</h3>
      </a>
      ${articleMeta(article, true)}
    </div>
  </article>`;
}

function renderSection(section) {
  const [featured, ...rest] = section.articles;
  if (!featured) return '';

  return `<section class="news-section" id="section-${escapeHtml(section.slug)}">
    <header class="section-header">
      <div><span class="section-eyebrow">SEÇÃO</span><h2>${escapeHtml(section.name)}</h2></div>
      <span class="section-count">${section.articles.length} matéria${section.articles.length === 1 ? '' : 's'}</span>
    </header>
    <div class="section-grid">
      <article class="section-feature">
        ${media(featured, 'section-media')}
        <div class="section-feature-copy">
          <a class="story-link" href="${escapeHtml(featured.link)}" target="_blank" rel="noopener noreferrer">
            <h3>${escapeHtml(featured.headline || featured.originalTitle)}</h3>
          </a>
          <p>${escapeHtml(featured.summary || featured.excerpt || '')}</p>
          ${articleMeta(featured)}
        </div>
      </article>
      <div class="section-list">
        ${rest.map(article => `<article class="list-story">
          <div>
            <span class="story-kicker single">${escapeHtml(categoryName(article))}</span>
            <a class="story-link" href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">
              <h3>${escapeHtml(article.headline || article.originalTitle)}</h3>
            </a>
            ${articleMeta(article, true)}
          </div>
          ${article.imageUrl ? `<div class="mini-thumb">${media(article, 'mini-media')}</div>` : ''}
        </article>`).join('')}
      </div>
    </div>
  </section>`;
}

function enabledCategories() {
  return state.categories.filter(category => category.enabled);
}

function saveSelection() {
  localStorage.setItem('highlords:selected', JSON.stringify([...state.selected]));
}

function selectAllCategories() {
  state.selected = new Set(enabledCategories().map(category => category.slug));
  saveSelection();
}

function renderCategories() {
  const bar = el('categoryBar');
  const categories = enabledCategories();
  if (!categories.length) {
    bar.innerHTML = '';
    return;
  }

  if (state.selected.size === 0) selectAllCategories();
  const allSelected = categories.every(category => state.selected.has(category.slug));

  bar.innerHTML = `
    <button class="category-chip category-all ${allSelected ? 'active' : ''}" data-select-all>Todos</button>
    ${categories.map(category => `<button class="category-chip ${state.selected.has(category.slug) ? 'active' : ''}" data-category="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</button>`).join('')}
  `;

  bar.querySelector('[data-select-all]')?.addEventListener('click', async () => {
    selectAllCategories();
    renderCategories();
    await loadEdition();
  });

  bar.querySelectorAll('[data-category]').forEach(button => {
    button.addEventListener('click', async () => {
      const slug = button.dataset.category;
      if (state.selected.has(slug)) state.selected.delete(slug);
      else state.selected.add(slug);
      if (state.selected.size === 0) state.selected.add(slug);
      saveSelection();
      renderCategories();
      await loadEdition();
    });
  });
}

function editionHighlights(edition) {
  return edition.sections
    .flatMap(section => section.articles || [])
    .filter(article => article.id !== edition.lead?.id)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 5);
}

function renderEdition(edition) {
  state.edition = edition;
  el('editorStatus').textContent = edition.curatedBy === 'ollama' ? 'Editor-chefe IA' : 'Edição por ranking';
  el('lead').innerHTML = renderLead(edition.lead);

  const highlights = editionHighlights(edition);
  el('highlights').innerHTML = highlights.length
    ? highlights.map(renderHighlight).join('')
    : '<p class="rail-empty">Os próximos destaques aparecem aqui conforme a edição ganha matérias.</p>';

  const visibleSections = edition.sections.filter(section => section.articles.length);
  el('sections').innerHTML = visibleSections.map(renderSection).join('');

  const articleCount = Number(edition.stats?.articles || 0);
  const sourceCount = Number(edition.stats?.sources || 0);
  el('editionCount').textContent = articleCount ? `${articleCount} selecionadas` : '';
  el('statArticles').textContent = articleCount;
  el('statSources').textContent = sourceCount;
  el('statMode').textContent = edition.curatedBy === 'ollama' ? 'Editor IA' : 'Ranking';
  if (state.health?.ollama?.model) el('statModel').textContent = state.health.ollama.model;

  const hasContent = Boolean(edition.lead) || visibleSections.length > 0;
  el('edition').classList.toggle('hidden', !hasContent);
  el('welcome').classList.toggle('hidden', hasContent);
}

async function loadEdition() {
  el('loading').classList.remove('hidden');
  el('errorBox').classList.add('hidden');

  try {
    const query = encodeURIComponent([...state.selected].join(','));
    const edition = await api(`/api/edition?categories=${query}`);
    renderEdition(edition);

    const hasContent = Boolean(edition.lead) || edition.sections.some(section => section.articles.length);
    if (!hasContent) {
      el('welcome').classList.remove('hidden');
      const running = Boolean(state.health?.refresh?.running);
      el('welcome').querySelector('h2').textContent = running ? 'Estamos preparando sua edição.' : 'Sua edição ainda está vazia.';
      el('welcome').querySelector('p').innerHTML = running
        ? 'Os feeds já foram coletados e o Ollama está processando as matérias. O progresso aparece no topo da página.'
        : 'Clique em <strong>Atualizar agora</strong> para buscar, classificar e resumir os feeds cadastrados.';
    }
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
    ? state.feeds.map(feed => `
      <div class="settings-item">
        <div class="settings-item-copy"><strong>${escapeHtml(feed.name)}</strong><small>${escapeHtml(feed.url)}</small>${feed.lastError ? `<small class="item-error">${escapeHtml(feed.lastError)}</small>` : ''}</div>
        <button class="text-button danger" data-delete-feed="${feed.id}">Remover</button>
      </div>
    `).join('')
    : '<p class="muted">Nenhum feed adicionado.</p>';

  el('categoriesList').innerHTML = state.categories.map(category => `
    <div class="settings-item ${category.enabled ? '' : 'disabled-item'}" data-slug="${escapeHtml(category.slug)}">
      <div class="settings-item-copy">
        <div class="item-title-row"><strong>${escapeHtml(category.name)}</strong>${category.enabled ? '' : '<span class="mini-badge">pausada</span>'}</div>
        <small>${escapeHtml(category.description || 'Sem descrição')}</small>
      </div>
      <div class="item-actions">
        <button class="text-button" data-edit-category="${category.id}">Editar</button>
        <button class="text-button danger" data-delete-category="${category.id}">Remover</button>
      </div>
    </div>
  `).join('');

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
    state.selected.delete(item?.dataset?.slug);
    saveSelection();
    await api(`/api/categories/${button.dataset.deleteCategory}`, { method: 'DELETE' });
    resetCategoryForm();
    await loadBootstrap();
  }));
}

function refreshPresentation(refresh) {
  const running = Boolean(refresh?.running);
  const p = refresh?.progress || {};
  const stage = p.stage || 'idle';
  const panel = el('refreshPanel');
  panel.classList.toggle('hidden', !running);

  let label = 'Atualizando…';
  let detail = '';
  let percent = 6;

  if (stage === 'collecting') {
    label = 'Lendo as fontes';
    detail = `${p.feedsDone || 0}/${p.feedsTotal || 0} feeds · ${p.discovered || 0} novas matérias`;
    percent = p.feedsTotal ? 8 + ((p.feedsDone || 0) / p.feedsTotal) * 22 : 10;
  } else if (stage === 'analyzing') {
    const completed = Number(p.processed || 0) + Number(p.failed || 0);
    label = 'Ollama analisando as notícias';
    detail = `${completed}/${p.queueTotal || 0}${p.currentSource ? ` · ${p.currentSource}` : ''}`;
    percent = p.queueTotal ? 30 + (completed / p.queueTotal) * 58 : 84;
  } else if (stage === 'curating') {
    label = 'Editor-chefe montando a edição';
    detail = 'Escolhendo manchete, destaques e ordem das seções';
    percent = 94;
  }

  el('refreshStage').textContent = label;
  el('refreshDetail').textContent = detail;
  el('refreshBar').style.width = `${Math.min(100, Math.max(0, percent))}%`;

  const button = el('refreshBtn');
  button.disabled = running;
  if (running && stage === 'analyzing') {
    const completed = Number(p.processed || 0) + Number(p.failed || 0);
    button.textContent = `Analisando ${completed}/${p.queueTotal || 0}`;
  } else if (running) {
    button.textContent = 'Atualizando…';
  } else {
    const backlog = Number(refresh?.lastRun?.backlog || 0);
    button.textContent = backlog > 0 ? `Continuar (${backlog})` : 'Atualizar agora';
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
      ? `Ollama · ${health.ollama.model}${health.ollama.modelAvailable ? '' : ' · modelo ausente'}`
      : 'Ollama offline';

    if (health.ollama.model) el('statModel').textContent = health.ollama.model;
    refreshPresentation(health.refresh);

    const run = health.refresh?.lastRun;
    if (run) {
      const extra = run.backlog > 0 ? ` · ${run.backlog} aguardando` : '';
      el('lastRun').textContent = `${timeFmt.format(new Date(run.finishedAt))} · ${run.processed} analisadas${extra}`;
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
  const valid = new Set(enabledCategories().map(category => category.slug));
  state.selected = new Set([...state.selected].filter(slug => valid.has(slug)));
  if (state.selected.size === 0) selectAllCategories();
  renderCategories();
  renderSettings();
  await loadHealth();
  await loadEdition();
}

async function pollRefresh() {
  for (let i = 0; i < 1800; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 1000));
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

dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});

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
    const valid = new Set(enabledCategories().map(category => category.slug));
    state.selected = new Set([...state.selected].filter(slug => valid.has(slug)));
    if (state.selected.size === 0) selectAllCategories();
    renderCategories();
    renderSettings();
    await loadEdition();
  } catch (error) {
    alert(error.message);
  }
});

loadBootstrap().catch(error => {
  el('errorBox').textContent = error.message;
  el('errorBox').classList.remove('hidden');
});

setInterval(() => {
  if (!state.health?.refresh?.running) loadHealth().catch(() => {});
}, 10000);
