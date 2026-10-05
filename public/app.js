const state = {
  edition: null,
  archive: [],
  feeds: [],
  categories: [],
  health: null,
  busy: false
};

const el = id => document.getElementById(id);
const CATEGORY_COLORS = {
  ia: '#a77cff',
  desenvolvimento: '#4cc77a',
  'mobile-gadgets': '#ff8a4c',
  hardware: '#4d8dff',
  'software-internet': '#39b8c8',
  games: '#ff4f87',
  futuro: '#e0b14c'
};

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

function formatEditionDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return value || '';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  }).format(new Date(year, month - 1, day));
}

function formatGeneratedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `gerada às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date)}`;
}

function relativeDate(value) {
  if (!value) return '';
  const stamp = new Date(value).getTime();
  if (!Number.isFinite(stamp)) return '';
  const minutes = Math.max(0, Math.round((Date.now() - stamp) / 60000));
  if (minutes < 2) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.round(hours / 24)}d`;
}

function categoryName(slug) {
  return state.categories.find(category => category.slug === slug)?.name || slug || 'Destaque';
}

function storyMeta(article) {
  return `<div class="story-meta">
    <span>${escapeHtml(article?.source || '')}</span>
    <span>${escapeHtml(relativeDate(article?.publishedAt))}</span>
    <span>${Number(article?.score || 0).toFixed(1)}</span>
  </div>`;
}

function tagMarkup(article) {
  const tags = Array.isArray(article?.tags) ? article.tags.slice(0, 5) : [];
  if (!tags.length) return '';
  return `<div class="story-tags">${tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`;
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
    const media = img.closest('[data-media]');
    const reject = () => media?.remove();
    img.addEventListener('error', reject, { once: true });
    if (img.complete && !img.naturalWidth) queueMicrotask(reject);
  });
}

function renderLead(article) {
  const target = el('leadSection');
  if (!article) {
    target.innerHTML = '';
    target.classList.add('hidden');
    return;
  }

  const image = imageMarkup(article, 'lead-media');
  target.classList.remove('hidden');
  target.innerHTML = `
    ${image}
    <div class="lead-copy">
      <div class="story-kicker" style="--section-color:${CATEGORY_COLORS[article.category] || '#d43a32'}">
        <span></span>${escapeHtml(categoryName(article.category))} · MANCHETE
      </div>
      <a class="story-link" href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">
        <h2>${escapeHtml(article.headline || article.originalTitle || 'Sem título')}</h2>
      </a>
      <p>${escapeHtml(article.summary || article.excerpt || '')}</p>
      ${tagMarkup(article)}
      ${storyMeta(article)}
    </div>`;
}

function renderStory(article) {
  const image = imageMarkup(article, 'story-media');
  return `<article class="newsletter-story">
    ${image}
    <div class="story-copy">
      <a class="story-link" href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">
        <h3>${escapeHtml(article.headline || article.originalTitle || 'Sem título')}</h3>
      </a>
      <p>${escapeHtml(article.summary || article.excerpt || '')}</p>
      ${tagMarkup(article)}
      ${storyMeta(article)}
    </div>
  </article>`;
}

function renderSections(sections = []) {
  el('sectionNav').innerHTML = sections.map(section => `
    <a href="#section-${escapeHtml(section.slug)}" style="--section-color:${CATEGORY_COLORS[section.slug] || '#d43a32'}">
      ${escapeHtml(section.name)} <span>${section.articles?.length || 0}</span>
    </a>`).join('');

  el('sections').innerHTML = sections.map(section => {
    const color = CATEGORY_COLORS[section.slug] || '#d43a32';
    const stories = section.articles?.length
      ? `<div class="section-story-grid">${section.articles.map(renderStory).join('')}</div>`
      : `<div class="section-empty">Nenhum destaque relevante nesta categoria para a edição de hoje.</div>`;

    return `<section id="section-${escapeHtml(section.slug)}" class="newsletter-section" style="--section-color:${color}">
      <div class="section-heading">
        <span class="section-number">${String(sections.indexOf(section) + 1).padStart(2, '0')}</span>
        <div>
          <span class="section-line"></span>
          <h2>${escapeHtml(section.name)}</h2>
        </div>
      </div>
      ${stories}
    </section>`;
  }).join('');
}

function renderEdition() {
  const edition = state.edition;
  el('newsletter').classList.toggle('hidden', !edition);
  el('emptyState').classList.toggle('hidden', Boolean(edition));
  el('downloadPdfBtn').classList.toggle('hidden', !edition);

  if (!edition) {
    el('generateBtn').textContent = 'Gerar Daily';
    return;
  }

  el('editionDate').textContent = formatEditionDate(edition.editionDate).toUpperCase();
  el('editionTitle').textContent = edition.title || 'O que vale sua atenção hoje';
  el('editionIntro').textContent = edition.intro || '';
  el('storyCount').textContent = edition.stats?.stories || 0;
  el('sourceCount').textContent = edition.stats?.sources || 0;
  el('curationMode').textContent = edition.curatedBy === 'ollama' ? 'curadoria por IA local' : 'curadoria por ranking';
  el('generatedAt').textContent = formatGeneratedAt(edition.generatedAt);
  el('downloadPdfBtn').href = `/api/daily/${encodeURIComponent(edition.editionDate)}/pdf`;
  el('generateBtn').textContent = edition.editionDate === todayKey() ? 'Regenerar edição' : 'Gerar edição de hoje';

  renderLead(edition.lead);
  renderSections(edition.sections || []);
  requestAnimationFrame(() => hydrateImages(document));
}

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderArchive() {
  const select = el('archiveSelect');
  const currentValue = select.value;
  select.innerHTML = '<option value="">Edições anteriores</option>' + state.archive.map(item => `
    <option value="${escapeHtml(item.editionDate)}">${escapeHtml(formatEditionDate(item.editionDate))} · ${item.storyCount}</option>`).join('');
  if (state.archive.some(item => item.editionDate === currentValue)) select.value = currentValue;
}

function renderFeeds() {
  el('feedCount').textContent = `${state.feeds.length} fontes`;
  el('feedsList').innerHTML = state.feeds.length
    ? state.feeds.map(feed => `<div class="settings-item">
        <div>
          <strong>${escapeHtml(feed.name)}</strong>
          <small>${escapeHtml(feed.url)}</small>
          ${feed.lastError ? `<small class="item-error">${escapeHtml(feed.lastError)}</small>` : ''}
        </div>
        <button class="text-button danger" data-delete-feed="${feed.id}" type="button">Remover</button>
      </div>`).join('')
    : '<p class="settings-help">Nenhuma fonte configurada.</p>';

  document.querySelectorAll('[data-delete-feed]').forEach(button => button.addEventListener('click', async () => {
    if (!confirm('Remover esta fonte da newsletter?')) return;
    await api(`/api/feeds/${button.dataset.deleteFeed}`, { method: 'DELETE' });
    state.feeds = await api('/api/feeds');
    renderFeeds();
  }));
}

function renderFixedCategories() {
  el('fixedCategories').innerHTML = state.categories.map((category, index) => `
    <div class="fixed-category" style="--section-color:${CATEGORY_COLORS[category.slug] || '#d43a32'}">
      <span>${String(index + 1).padStart(2, '0')}</span>
      <div><strong>${escapeHtml(category.name)}</strong><small>${escapeHtml(category.description)}</small></div>
    </div>`).join('');
}

function showToast(message) {
  const toast = el('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add('hidden'), 2200);
}

function showError(message) {
  el('errorBox').textContent = message;
  el('errorBox').classList.remove('hidden');
}

function clearError() {
  el('errorBox').classList.add('hidden');
}

function setBusy(value) {
  state.busy = value;
  el('generateBtn').disabled = value;
  document.querySelectorAll('[data-generate]').forEach(button => { button.disabled = value; });
  el('archiveSelect').disabled = value;
}

function setProgress(show, title = '', detail = '', percent = 0) {
  el('progressPanel').classList.toggle('hidden', !show);
  if (!show) return;
  el('progressTitle').textContent = title;
  el('progressDetail').textContent = detail;
  el('progressBar').style.width = `${Math.max(2, Math.min(100, percent))}%`;
}

function presentRefresh(status, pass = 1) {
  const p = status?.progress || {};
  if (p.stage === 'collecting') {
    const ratio = p.feedsTotal ? (p.feedsDone || 0) / p.feedsTotal : 0;
    setProgress(true, 'Coletando fontes', `${p.feedsDone || 0}/${p.feedsTotal || 0} feeds · rodada ${pass}`, 8 + ratio * 20);
  } else if (p.stage === 'analyzing') {
    const done = Number(p.processed || 0) + Number(p.failed || 0);
    const ratio = p.queueTotal ? done / p.queueTotal : 1;
    setProgress(true, 'Analisando notícias', `${done}/${p.queueTotal || 0} matérias · ${p.currentSource || 'Ollama local'}`, 30 + ratio * 55);
  }
}

async function waitForRefresh(pass) {
  for (let i = 0; i < 2400; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 900));
    const status = await api('/api/refresh/status');
    presentRefresh(status, pass);
    if (!status.running) return status;
  }
  throw new Error('A atualização demorou mais do que o esperado.');
}

async function generateDaily() {
  if (state.busy) return;
  setBusy(true);
  clearError();

  try {
    let pass = 0;
    let status;
    do {
      pass += 1;
      setProgress(true, 'Atualizando a redação', `Preparando rodada ${pass}`, 5);
      await api('/api/refresh', { method: 'POST' });
      status = await waitForRefresh(pass);
    } while ((status?.lastRun?.backlog || 0) > 0 && pass < 20);

    setProgress(true, 'Montando o Highlords Daily', 'Selecionando as melhores matérias das sete seções', 92);
    const result = await api('/api/daily/generate', {
      method: 'POST',
      body: JSON.stringify({ force: true })
    });

    state.edition = result.edition;
    renderEdition();
    await loadArchive();
    setProgress(true, 'Edição pronta', `${state.edition.stats?.stories || 0} matérias selecionadas`, 100);
    showToast('Highlords Daily gerado com sucesso.');
    setTimeout(() => setProgress(false), 700);
  } catch (error) {
    setProgress(false);
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

async function loadHealth() {
  try {
    const health = await api('/api/health');
    state.health = health;
    const status = el('ollamaStatus');
    status.classList.toggle('ok', health.ollama?.ok);
    status.classList.toggle('bad', !health.ollama?.ok);
    status.textContent = health.ollama?.ok
      ? `${health.ollama.model}${health.ollama.modelAvailable ? '' : ' · ausente'}`
      : 'Ollama offline';
  } catch {
    el('ollamaStatus').classList.add('bad');
    el('ollamaStatus').textContent = 'Servidor indisponível';
  }
}

async function loadArchive() {
  const response = await api('/api/daily/archive?limit=45');
  state.archive = Array.isArray(response.editions) ? response.editions : [];
  renderArchive();
}

async function loadLatestEdition() {
  const response = await api('/api/daily/latest');
  state.edition = response.edition || null;
  renderEdition();
}

async function loadBootstrap() {
  const [categories, feeds] = await Promise.all([
    api('/api/categories'),
    api('/api/feeds')
  ]);
  state.categories = categories;
  state.feeds = feeds;
  renderFixedCategories();
  renderFeeds();
  await Promise.all([loadHealth(), loadArchive(), loadLatestEdition()]);
}

el('generateBtn').addEventListener('click', generateDaily);
document.querySelectorAll('[data-generate]').forEach(button => button.addEventListener('click', generateDaily));

el('archiveSelect').addEventListener('change', async event => {
  const date = event.currentTarget.value;
  if (!date) return;
  try {
    clearError();
    const response = await api(`/api/daily/${encodeURIComponent(date)}`);
    state.edition = response.edition;
    renderEdition();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showError(error.message);
  }
});

const dialog = el('settingsDialog');
el('settingsBtn').addEventListener('click', () => dialog.showModal());
el('closeSettings').addEventListener('click', () => dialog.close());
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
    renderFeeds();
  } catch (error) {
    alert(error.message);
  }
});

loadBootstrap().catch(error => showError(error.message));
setInterval(loadHealth, 10000);
