// RAG pipeline: ingest (extract -> chunk -> embed -> store) and answer (retrieve -> generate).
import { query, queryOne } from "../db.js";
import { embed, embedBatch, generate, toVector } from "../gemini.js";
import { extractPages } from "./pdf.js";
import { chunkPages } from "./chunk.js";

// Ingest a PDF buffer: returns the created document row.
export async function ingest(buffer, filename) {
  const { pages, numPages } = await extractPages(buffer);
  const chunks = chunkPages(pages);
  if (!chunks.length) throw new Error("No extractable text found in this PDF (it may be scanned/image-only).");

  const doc = await queryOne(
    "INSERT INTO sensiwise.documents (filename, pages, chunk_count) VALUES ($1,$2,$3) RETURNING *",
    [filename, numPages, chunks.length]
  );

  const vectors = await embedBatch(chunks.map((c) => c.text));
  // Bulk insert chunks.
  const values = [];
  const rows = chunks
    .map((c, i) => {
      const b = i * 5;
      values.push(doc.id, c.text, c.page, i, toVector(vectors[i]));
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::vector)`;
    })
    .join(",");
  await query(
    `INSERT INTO sensiwise.chunks (document_id, chunk_text, page, chunk_index, embedding) VALUES ${rows}`,
    values
  );
  return doc;
}

// Retrieve top-k chunks by cosine similarity, optionally scoped to specific documents.
export async function retrieve(question, { k = 5, documentIds = null } = {}) {
  const qv = toVector(await embed(question, "RETRIEVAL_QUERY"));
  const scope = documentIds?.length ? "AND c.document_id = ANY($3)" : "";
  const params = documentIds?.length ? [qv, k, documentIds] : [qv, k];
  return query(
    `SELECT c.chunk_text, c.page, d.id AS document_id, d.filename,
            1 - (c.embedding <=> $1::vector) AS similarity
     FROM sensiwise.chunks c
     JOIN sensiwise.documents d ON d.id = c.document_id
     WHERE TRUE ${scope}
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    params
  );
}

// Generate a grounded, cited answer from retrieved context.
export async function answer(question, contexts, history = []) {
  const context = contexts
    .map((c, i) => `[${i + 1}] (${c.filename}, p.${c.page}) ${c.chunk_text}`)
    .join("\n\n");
  const mem = history.length
    ? `\nRecent conversation (for context):\n${history.map((h) => `Q: ${h.q}\nA: ${h.a}`).join("\n")}\n`
    : "";
  const prompt = `You are a document intelligence assistant. Answer the user's question using ONLY the context excerpts below.
Cite the excerpts you use with inline bracketed numbers like [1], [2]. Be accurate and concise.
If the answer is not contained in the context, say you couldn't find it in the uploaded document(s).
${mem}
Context:
${context}

Question: ${question}

Answer:`;
  return (await generate(prompt)).trim();
}
