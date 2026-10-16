import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Optimize only the rendered PDF copy; original assets and archived HTML stay
// intact. Chromium is already running, so no native image dependency is needed.
export async function optimizePdfImages(page) {
  const sources = await page.$$eval(".story-image img", (images) => [
    ...new Set(images.map((image) => image.currentSrc || image.src)),
  ]);
  const sizes = {};
  for (const src of sources) {
    if (
      /^data:image\/(?:svg\+xml|gif)/i.test(src) ||
      /\.(?:svg|gif)(?:[?#]|$)/i.test(src)
    )
      continue;
    try {
      if (src.startsWith("file:"))
        sizes[src] = (await fs.stat(fileURLToPath(src))).size;
      else if (/^data:image\/[^;,]+;base64,/i.test(src))
        sizes[src] = Buffer.from(
          src.slice(src.indexOf(",") + 1),
          "base64",
        ).length;
    } catch {
      /* Unavailable originals retain their original image. */
    }
  }
  return page.evaluate(async (sizes) => {
    const result = {
      optimized: 0,
      originalBytes: 0,
      optimizedBytes: 0,
      savedBytes: 0,
    };
    const replacements = new Map();
    for (const image of document.querySelectorAll(".story-image img")) {
      const src = image.currentSrc || image.src;
      const bytes = sizes[src];
      if (!bytes || bytes < 20000) continue;
      if (replacements.has(src)) {
        image.src = replacements.get(src);
        continue;
      }
      try {
        const scale = Math.min(
          1,
          1400 / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data;
        let alpha = false;
        for (let offset = 3; offset < pixels.length; offset += 4)
          if (pixels[offset] !== 255) {
            alpha = true;
            break;
          }
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, alpha ? "image/png" : "image/jpeg", 0.82),
        );
        if (!blob || blob.size >= bytes * 0.9) continue;
        const replacement = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        const probe = new Image();
        probe.src = replacement;
        await probe.decode();
        image.src = replacement;
        replacements.set(src, replacement);
        result.optimized++;
        result.originalBytes += bytes;
        result.optimizedBytes += blob.size;
      } catch {
        /* CORS/canvas/decode failures must not discard a valid photo. */
      }
    }
    result.savedBytes = result.originalBytes - result.optimizedBytes;
    return result;
  }, sizes);
}
