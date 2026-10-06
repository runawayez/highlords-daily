const keys = ['PRESET','EDITORIAL_PROFILE','LANGUAGE','EDITORIAL_CONTEXT','TIME_ZONE','PUBLICATION_NAME','PUBLICATION_TAGLINE','OLLAMA_MODEL','ITEMS_PER_CATEGORY'];
const log = document.querySelector('#log');
const status = document.querySelector('#status');

async function load() {
  const config = await window.highlords.loadConfig();
  const defaults = { PRESET:'br', EDITORIAL_PROFILE:'balanced', LANGUAGE:'pt-BR', EDITORIAL_CONTEXT:'Brasil', TIME_ZONE:'America/Sao_Paulo', PUBLICATION_NAME:'Highlords Daily', PUBLICATION_TAGLINE:'', OLLAMA_MODEL:'qwen3:4b', ITEMS_PER_CATEGORY:'2' };
  for (const key of keys) document.querySelector(`#${key}`).value = config[key] ?? defaults[key] ?? '';
}

function values() {
  return Object.fromEntries(keys.map(key => [key, document.querySelector(`#${key}`).value.trim()]));
}

document.querySelector('#save').addEventListener('click', async () => {
  await window.highlords.saveConfig(values());
  status.textContent = 'saved';
});

document.querySelector('#generate').addEventListener('click', async () => {
  await window.highlords.saveConfig(values());
  log.textContent = '';
  const result = await window.highlords.generate();
  if (!result.ok) log.textContent += `\nERROR: ${result.error}\n`;
});

document.querySelector('#openOutput').addEventListener('click', async () => {
  const result = await window.highlords.openOutput();
  if (!result.ok) log.textContent += `\n${result.error}\n`;
});

window.highlords.onLog(line => { log.textContent += line; log.scrollTop = log.scrollHeight; });
window.highlords.onStatus(value => { status.textContent = value; });
load();
