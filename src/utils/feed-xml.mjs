export function decodeFeed(buffer, contentType = "") {
  const header = buffer.subarray(0, 256).toString("ascii");
  const encoding =
    header.match(/<\?xml[^>]*encoding=["']([^"']+)["']/i)?.[1] ||
    contentType.match(/charset=["']?([^;\s"']+)/i)?.[1] ||
    "utf-8";
  let xml;
  try {
    xml = new TextDecoder(encoding).decode(buffer);
  } catch {
    throw new Error(`Unsupported feed encoding: ${encoding}`);
  }
  if (!xml.trim()) throw new Error("Feed returned an empty response.");
  if (/<(?:!doctype\s+html|html)(?:\s|>)/i.test(xml.slice(0, 1000)))
    throw new Error(
      "Feed returned an HTML page instead of RSS/Atom; check the URL or publisher blocking.",
    );
  if (!/<(?:rss|feed|rdf:RDF)(?:\s|>)/i.test(xml))
    throw new Error("Response does not contain RSS/Atom.");
  // Some legacy publishers omit the mandatory RSS version attribute.
  return xml.replace(/<rss\s*>/i, '<rss version="2.0">');
}
