// Minimal Express API for the Document Intelligence Assistant.
import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { query, queryOne } from "./db.js";
import { ingest, retrieve, answer } from "./lib/rag.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) =>
    file.mimetype === "application/pdf" ? cb(null, true) : cb(new Error("Only PDF files are allowed")),
});

// In-memory per-session conversation history (multi-turn memory).
const sessions = new Map();

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// List uploaded documents.
app.get("/api/documents", async (_req, res) => {
  const docs = await query(
    "SELECT id, filename, pages, chunk_count, created_at FROM sensiwise.documents ORDER BY created_at DESC"
  );
  res.json(docs);
});

// Upload + ingest one or more PDFs.
app.post("/api/upload", upload.array("files", 10), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: "No PDF files uploaded" });
  try {
    const docs = [];
    for (const f of req.files) {
      const doc = await ingest(f.buffer, f.originalname);
      console.log(`[ingest] ${f.originalname} -> doc ${doc.id} (${doc.chunk_count} chunks, ${doc.pages} pages)`);
      docs.push(doc);
    }
    res.json({ documents: docs });
  } catch (e) {
    console.error("[upload]", e);
    res.status(500).json({ error: e.message });
  }
});

// Delete a document (and its chunks via cascade).
app.delete("/api/documents/:id", async (req, res) => {
  await query("DELETE FROM sensiwise.documents WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

// Ask a question (RAG). Optional documentIds scopes to specific docs (multi-doc querying).
app.post("/api/query", async (req, res) => {
  const { question, documentIds = null, sessionId = "default" } = req.body || {};
  if (!question?.trim()) return res.status(400).json({ error: "question is required" });

  const t0 = Date.now();
  try {
    const history = sessions.get(sessionId) || [];
    const contexts = await retrieve(question.trim(), { documentIds });
    if (!contexts.length) {
      const docCount = await queryOne("SELECT COUNT(*)::int AS n FROM sensiwise.documents");
      const latencyMs = Date.now() - t0;
      const answer = docCount?.n
        ? "I couldn't find relevant content for that question in the uploaded document(s)."
        : "No documents have been uploaded yet. Please upload a PDF first.";
      return res.json({ answer, sources: [], latencyMs });
    }

    const text = await answer(question.trim(), contexts, history);
    const confidence = +Number(contexts[0].similarity).toFixed(3);
    const sources = contexts.map((c, i) => ({
      n: i + 1,
      filename: c.filename,
      page: c.page,
      documentId: c.document_id,
      similarity: +Number(c.similarity).toFixed(3),
      snippet: c.chunk_text.slice(0, 220) + (c.chunk_text.length > 220 ? "…" : ""),
    }));

    history.push({ q: question.trim(), a: text });
    sessions.set(sessionId, history.slice(-6));

    const latencyMs = Date.now() - t0;
    console.log(`[query] "${question}" -> conf=${confidence} ${latencyMs}ms`);
    res.json({ answer: text, sources, confidence, latencyMs });
  } catch (e) {
    console.error("[query]", e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Sensiwise Doc-Intel API on http://localhost:${PORT}`));
