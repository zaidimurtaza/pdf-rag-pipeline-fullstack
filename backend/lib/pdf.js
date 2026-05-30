// PDF text extraction with per-page text (so we can cite page numbers).
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// pdf-parse ships as CommonJS; require its core to avoid the package's debug index.
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

export async function extractPages(buffer) {
  const pages = [];
  const data = await pdfParse(buffer, {
    // Called once per page — collect plain text in reading order.
    pagerender: async (pageData) => {
      const tc = await pageData.getTextContent();
      const text = tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      pages.push(text);
      return text;
    },
  });
  return { pages, numPages: data.numpages };
}
