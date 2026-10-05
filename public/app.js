const state = {
  categories: [],
  activeFilter: localStorage.getItem('highlords:filter') || 'all',
  feeds: [],
  edition: null,
  health: null
};

const el = id => document.getElementById(id);
const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric'
});
const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
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
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
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

function articleMeta(article, compact = false) {
  const score = Number(article?.score || 0).toFixed(1);
  return `<div class="story-meta ${compact ? 'compact' : ''}">
    <span class="source-name">${escapeHtml(article?.source || '')}</span>
    <span>${escapeHtml(relativeDate(article?.publishedAt))}</span>
    <span class="relevance" title="Relevância editorial">${score}</span>
  </div>`;
}

function media(article, className = '', minWidth = 260) {
  const image = article?.imageUrl ? safeUrl(article.imageUrl) : null;
  return `<div class="story-media ${className}">
    ${image && image !== '#' ? `<img
      src="${escapeHtml(image)}"
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      data-remote-image
      data-min-width="${minWidth}"
    />` : ''}
    <div class="media-fallback">
      <img src="/assets/highlords-logo.svg" alt="" />
      <span>${escapeHtml(categoryName(article))}</span>
    </div>
  </div>`;
}

function hydrateImages(root = document) {
  root.querySelectorAll('img[data-remote-image]').forEach(img => {
    if (img.dataset.hydrated === 'true') return;
    img.dataset.hydrated = 'true';
    const wrapper = img.closest('.story-media');
    const minWidth = Number(img.dataset.minWidth || 240);

    const reject = () => {
      wrapper?.classList.remove('has-image');
      img.remove();
    };

    const accept = () => {
      const width = img.naturalWidth || 0;
      const height = img.naturalHeight || 0;
      const ratio = height ? width / height : 0;
      if (width < minWidth || height < 120 || ratio < 0.75 || ratio > 3.2) {
        reject();
        return;
      }
      wrapper?.classList.add('has-image');
    };

    img.addEventListener('load', accept, { once: true });
    img.addEventListener('error', reject, { once: true });
    if (img.complete) queueMicrotask(() => (img.naturalWidth ? accept() : reject()));
  });
}

function storyTitle(article) {
  return escapeHtml(article?.headline || article?.originalTitle || 'Sem título');
}

function storyLink(article) {
  return escapeHtml(safeUrl(article?.link));
}

function renderLead(article) {
  if (!article) return '';
  return `
    <a class="lead-media-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
      ${media(article, 'lead-media', 440)}
    </a>
    <div class="lead-copy">
      <div class="story-kicker">${escapeHtml(categoryName(article))}<span>Manchete</span></div>
      <a class="story-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
        <h1>${storyTitle(article)}</h1>
      </a>
      <p class="lead-summary">${escapeHtml(article.summary || article.excerpt || '')}</p>
      <div class="lead-footer">
        ${articleMeta(article)}
        <a class="read-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">Ler matéria <span>↗</span></a>
      </div>
    </div>`;
}

function renderHighlight(article, index) {
  return `<article class="highlight-item">
    <span class="highlight-index">${String(index + 1).padStart(2, '0')}</span>
    <div class="highlight-copy">
      <span class="story-kicker compact-kicker">${escapeHtml(categoryName(article))}</span>
      <a class="story-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
        <h3>${storyTitle(article)}</h3>
      </a>
      ${articleMeta(article, true)}
    </div>
  </article>`;
}

function renderCompactStory(article) {
  return `<article class="list-story">
    <div class="list-story-copy">
      <span class="story-kicker compact-kicker">${escapeHtml(categoryName(article))}</span>
      <a class="story-link" href="${storyLink(article)}" target="_blank" rel="noopener noreferrer">
        <h3>${storyTitle(article)}</h3>
      </a>
      ${articleMeta(article, true)}
    </div>
    ${article.imageUrl ? `<div class="mini-thumb">${media(article, 'mini-media', 120)}</div>` : ''}
  </article>`;
}

function renderSection(section, leadId) {
  const articles = (section.articles || []).filter(article => article.id !== leadId);
  const [featured, ...rest] = articles;
  if (!featured) return '';

  return `<section class="news-section" id="section-${escapeHtml(section.slug)}">
    <header class="section-header">
      <div>
        <span class="section-eyebrow">${escapeHtml(section.name)}</span>
        <h2>${escapeHtml(section.name)}</h2>
      </div>
      <span class="section-count">${articles.length} matéria${articles.length === 1 ? '' : 's'}</span>
    </header>

    <div class="section-grid">
      <article class="section-feature">
        <a href="${storyLink(featured)}" target="_blank" rel="noopener noreferrer" class="section-media-link">
          ${media(featured, 'section-media', 320)}
        </a>
        <div class="section-feature-copy">
          <a class="story-link" href="${storyLink(featured)}" target="_blank" rel="noopener noreferrer">
            <h3>${storyTitle(featured)}</h3>
          </a>
          <p>${escapeHtml(featured.summary || featured.excerpt || '')}</p>
          ${articleMeta(featured)}
        </div>
      </article>
      <div class="section-list">${rest.slice(0, 5).map(renderCompactStory).join('')}</div>
    </div>
  </section>`;
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
  const bar = el('categoryBar');
  const categories = enabledCategories();
  normalizeFilter();

  bar.innerHTML = `
    <button class="category-chip ${state.activeFilter === 'all' ? 'active' : ''}" data-filter="all" aria-pressed="${state.activeFilter === 'all'}">Todos</button>
    ${categories.map(category => `<button
      class="category-chip ${state.activeFilter === category.slug ? 'active' : ''}"
      data-filter="${escapeHtml(category.slug)}"
      aria-pressed="${state.activeFilter === category.slug}"
    >${escapeHtml(category.name)}</button>`).join('')}`;

  bar.querySelectorAll('[data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      state.activeFilter = button.dataset.filter || 'all';
      localStorage.setItem('highlords:filter', state.activeFilter);
      renderCategories();
      if (state.edition) renderEdition(state.edition);
    });
  });
}

function uniqueArticles(articles) {
  const seen = new Set();
  return articles.filter(article => {
    if (!article || seen.has(article.id)) return false;
    seen.add(article.id);
    return true;
  });
}

function viewEdition(edition) {
  if (!edition || state.activeFilter === 'all') return edition;

  const section = edition.sections.find(item => item.slug === state.activeFilter);
  const candidates = uniqueArticles([
    edition.lead?.category === state.activeFilter ? edition.lead : null,
    ...(section?.articles || [])
  ].filter(Boolean));

  const lead = candidates[0] || null;
  const category = enabledCategories().find(item => item.slug === state.activeFilter);

  return {
    ...edition,
    lead,
    stats: {
      articles: candidates.length,
      sources: new Set(candidates.map(article => article.source)).size
    },
    sections: category ? [{ ...category, articles: candidates.slice(1) }] : []
  };
}

function editionHighlights(edition) {
  if (!edition) return [];
  return uniqueArticles([
    ...edition.sections.flatMap(section => section.articles || [])
  ])
    .filter(article => article.id !== edition.lead?.id)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 4);
}

function renderEdition(rawEdition) {
  state.edition = rawEdition;
  const edition = viewEdition(rawEdition);
  if (!edition) return;

  el('editorStatus').textContent = rawEdition.curatedBy === 'ollama' ? 'Curadoria por IA local' : 'Curadoria por relevância';
  el('lead').innerHTML = renderLead(edition.lead);

  const highlights = editionHighlights(edition);
  el('highlights').innerHTML = highlights.length
    ? highlights.map(renderHighlight).join('')
    : '<p class="rail-empty">Sem outros destaques nesta visualização.</p>';

  const visibleSections = edition.sections.filter(section => (section.articles || []).some(article => article.id !== edition.lead?.id));
  el('sections').innerHTML = visibleSections.map(section => renderSection(section, edition.lead?.id)).join('');

  const articleCount = Number(edition.stats?.articles || 0);
  const sourceCount = Number(edition.stats?.sources || 0);
  el('editionCount').textContent = articleCount ? `${articleCount} matérias` : '';
  el('statArticles').textContent = articleCount;
  el('statSources').textContent = sourceCount;
  el('statMode').textContent = rawEdition.curatedBy === 'ollama' ? 'IA local' : 'Ranking';
  if (state.health?.ollama?.model) el('statModel').textContent = state.health.ollama.model;

  const hasContent = Boolean(edition.lead) || visibleSections.length > 0;
  el('edition').classList.toggle('hidden', !hasContent);
  el('welcome').classList.toggle('hidden', hasContent);

  requestAnimationFrame(() => hydrateImages(el('edition')));
}

async function loadEdition() {
  el('loading').classList.remove('hidden');
  el('errorBox').classList.add('hidden');

  try {
    const edition = await api('/api/edition');
    renderEdition(edition);

    const hasContent = Boolean(edition.lead) || edition.sections.some(section => section.articles.length);
    if (!hasContent) {
      el('welcome').classList.remove('hidden');
      const running = Boolean(state.health?.refresh?.running);
      el('welcomeTitle').textContent = running ? 'Sua edição está sendo preparada.' : 'Sua edição ainda está vazia.';
      el('welcomeCopy').innerHTML = running
        ? 'O Ollama está classificando e resumindo as notícias. Você pode continuar nesta tela; ela atualiza quando o processamento terminar.'
        : 'Clique em <strong>Atualizar</strong> para coletar e analisar as fontes cadastradas.';
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
        <div class="settings-item-copy">
          <strong>${escapeHtml(feed.name)}</strong>
          <small>${escapeHtml(feed.url)}</small>
          ${feed.lastError ? `<small class="item-error">${escapeHtml(feed.lastError)}</small>` : ''}
        </div>
        <button class="text-button danger" data-delete-feed="${feed.id}">Remover</button>
      </div>`).join('')
    : '<p class="muted">Nenhum feed adicionado.</p>';

  el('categoriesList').innerHTML = state.categories.map(category => `
    <div class="settings-item ${category.enabled ? '' : 'disabled-item'}" data-slug="${escapeHtml(category.slug)}">
      <div class="settings-item-copy">
        <div class="item-title-row">
          <strong>${escapeHtml(category.name)}</strong>
          ${category.enabled ? '' : '<span class="mini-badge">pausada</span>'}
        </div>
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

    if (health.ollama.model) el('statModel').textContent = health.ollama.model;
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
  await loadEdition();
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
    normalizeFilter();
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

setInterval(loadHealth, 10000);
