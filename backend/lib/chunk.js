// Split per-page text into overlapping word-windows, keeping the source page number.
export function chunkPages(pages, size = 180, overlap = 40) {
  const chunks = [];
  pages.forEach((text, p) => {
    if (!text) return;
    const words = text.split(/\s+/);
    for (let i = 0; i < words.length; i += size - overlap) {
      const slice = words.slice(i, i + size).join(" ").trim();
      if (slice.length > 30) chunks.push({ text: slice, page: p + 1 });
      if (i + size >= words.length) break;
    }
  });
  return chunks;
}
