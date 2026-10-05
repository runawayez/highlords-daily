const state = {
  categories: [],
  selected: new Set(JSON.parse(localStorage.getItem('highlords:selected') || '[]')),
  feeds: []
};

const el = id => document.getElementById(id);
const dateFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

el('dateLabel').textContent = dateFmt.format(new Date());

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function relativeDate(value) {
  if (!value) return '';
  const ms = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.round(ms / 3_600_000));
  if (hours < 1) return 'agora';
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  return `há ${days}d`;
}

function articleMeta(article) {
  return `<div class="meta"><span>${escapeHtml(article.source)}</span><span>•</span><span>${relativeDate(article.publishedAt)}</span><span>•</span><span class="score">${Number(article.score).toFixed(1)}/10</span></div>`;
}

function renderLead(article) {
  if (!article) return '';
  const category = state.categories.find(c => c.slug === article.category)?.name || article.category || 'Destaque';
  return `
    <div class="lead-copy">
      <span class="kicker">${escapeHtml(category)} · DESTAQUE</span>
      <a class="story-link" href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">
        <h2>${escapeHtml(article.headline || article.originalTitle)}</h2>
      </a>
      <p class="summary">${escapeHtml(article.summary || article.excerpt || '')}</p>
      ${articleMeta(article)}
    </div>
    <div class="lead-mark"><img src="/assets/highlords-logo.svg" alt="" /></div>
  `;
}

function renderStory(article) {
  const category = state.categories.find(c => c.slug === article.category)?.name || article.category || '';
  return `
    <article class="story">
      <span class="kicker">${escapeHtml(category)}</span>
      <a class="story-link" href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">
        <h3>${escapeHtml(article.headline || article.originalTitle)}</h3>
      </a>
      <p>${escapeHtml(article.summary || article.excerpt || '')}</p>
      ${articleMeta(article)}
    </article>
  `;
}

function enabledCategories() {
  return state.categories.filter(category => category.enabled);
}

function selectAllCategories() {
  state.selected = new Set(enabledCategories().map(category => category.slug));
  localStorage.setItem('highlords:selected', JSON.stringify([...state.selected]));
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
      localStorage.setItem('highlords:selected', JSON.stringify([...state.selected]));
      renderCategories();
      await loadEdition();
    });
  });
}

async function loadEdition() {
  el('loading').classList.remove('hidden');
  el('edition').classList.add('hidden');
  el('welcome').classList.add('hidden');
  el('errorBox').classList.add('hidden');

  try {
    const query = encodeURIComponent([...state.selected].join(','));
    const edition = await api(`/api/edition?categories=${query}`);
    el('editorStatus').textContent = edition.curatedBy === 'ollama' ? 'Edição organizada pelo editor-chefe IA' : 'Edição por ranking';
    el('lead').innerHTML = renderLead(edition.lead);
    el('sections').innerHTML = edition.sections
      .filter(section => section.articles.length)
      .map(section => `
        <section class="news-section">
          <div class="section-title"><h2>${escapeHtml(section.name)}</h2></div>
          <div class="story-grid">${section.articles.map(renderStory).join('')}</div>
        </section>
      `).join('');

    const hasContent = Boolean(edition.lead) || edition.sections.some(section => section.articles.length);
    el('edition').classList.toggle('hidden', !hasContent);
    el('welcome').classList.toggle('hidden', hasContent);
    if (!hasContent) {
      el('welcome').classList.remove('hidden');
      el('welcome').querySelector('h2').textContent = state.feeds.length ? 'Ainda não há matérias na edição.' : 'Sua primeira edição começa pelas fontes.';
      el('welcome').querySelector('p:not(.eyebrow)').innerHTML = state.feeds.length
        ? 'Clique em <strong>Atualizar agora</strong> para buscar, classificar e resumir os feeds cadastrados.'
        : 'Adicione alguns feeds RSS/Atom e clique em <strong>Atualizar agora</strong>.';
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
  el('feedsList').innerHTML = state.feeds.length
    ? state.feeds.map(feed => `
      <div class="settings-item">
        <div><strong>${escapeHtml(feed.name)}</strong><small>${escapeHtml(feed.url)}</small>${feed.lastError ? `<small class="item-error">Erro: ${escapeHtml(feed.lastError)}</small>` : ''}</div>
        <button class="delete-button" data-delete-feed="${feed.id}">remover</button>
      </div>
    `).join('')
    : '<p class="muted">Nenhum feed adicionado.</p>';

  el('categoriesList').innerHTML = state.categories.map(category => `
    <div class="settings-item ${category.enabled ? '' : 'disabled-item'}" data-slug="${escapeHtml(category.slug)}">
      <div>
        <div class="item-title-row"><strong>${escapeHtml(category.name)}</strong>${category.enabled ? '' : '<span class="mini-badge">pausada</span>'}</div>
        <small>${escapeHtml(category.description || 'Sem descrição')}</small>
      </div>
      <div class="item-actions">
        <button class="edit-button" data-edit-category="${category.id}">editar</button>
        <button class="delete-button" data-delete-category="${category.id}">remover</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-delete-feed]').forEach(button => button.addEventListener('click', async () => {
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
    if (!confirm(`Remover ${name}? As matérias já classificadas nela deixam de aparecer até serem reprocessadas.`)) return;
    state.selected.delete(item?.dataset?.slug);
    localStorage.setItem('highlords:selected', JSON.stringify([...state.selected]));
    await api(`/api/categories/${button.dataset.deleteCategory}`, { method: 'DELETE' });
    resetCategoryForm();
    await loadBootstrap();
  }));
}

async function loadHealth() {
  try {
    const health = await api('/api/health');
    const status = el('ollamaStatus');
    status.classList.toggle('ok', health.ollama.ok);
    status.classList.toggle('bad', !health.ollama.ok);
    status.textContent = health.ollama.ok
      ? `Ollama · ${health.ollama.model}${health.ollama.modelAvailable ? '' : ' (modelo ausente)'}`
      : 'Ollama offline';
    const run = health.refresh?.lastRun;
    el('lastRun').textContent = run ? `Última atualização: ${timeFmt.format(new Date(run.finishedAt))}` : '';
    el('refreshBtn').disabled = Boolean(health.refresh?.running);
    el('refreshBtn').textContent = health.refresh?.running ? 'Atualizando…' : 'Atualizar agora';
  } catch {
    el('ollamaStatus').classList.add('bad');
    el('ollamaStatus').textContent = 'Servidor indisponível';
  }
}

async function loadBootstrap() {
  [state.categories, state.feeds] = await Promise.all([api('/api/categories'), api('/api/feeds')]);
  const valid = new Set(enabledCategories().map(c => c.slug));
  state.selected = new Set([...state.selected].filter(slug => valid.has(slug)));
  if (state.selected.size === 0) selectAllCategories();
  renderCategories();
  renderSettings();
  await loadEdition();
  await loadHealth();
}

async function pollRefresh() {
  for (let i = 0; i < 240; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    const status = await api('/api/refresh/status');
    if (!status.running) {
      await loadBootstrap();
      return;
    }
    await loadHealth();
  }
}

el('refreshBtn').addEventListener('click', async () => {
  try {
    el('refreshBtn').disabled = true;
    el('refreshBtn').textContent = 'Atualizando…';
    await api('/api/refresh', { method: 'POST' });
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
    await loadEdition();
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
    const valid = new Set(enabledCategories().map(c => c.slug));
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

setInterval(loadHealth, 10000);
