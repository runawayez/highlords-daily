// Ollama resolves an untagged model to :latest, not to any tag with a similar prefix.
export function hasOllamaModel(names, requested) {
  const expected = requested.includes(':') ? requested : `${requested}:latest`;
  return names.some(name => name === expected || (name === requested && !requested.includes(':')));
}
