// Node's dotenv parser preserves backslashes. JSON.stringify would double Windows paths.
export function envValue(value) {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_./:\\-]+$/.test(text)) return text;
  if (/[\r\n]/.test(text)) throw new Error('Valores de configuração devem ocupar uma única linha.');
  const quote = ['"', "'", '`'].find(candidate => !text.includes(candidate));
  if (!quote) throw new Error('O valor contém todos os delimitadores de aspas; simplifique o texto.');
  return `${quote}${text}${quote}`;
}
