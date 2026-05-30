# Technical Note

## Design decisions

**RAG over fine-tuning.** The task is grounded Q&A over user-supplied PDFs, so
retrieval-augmented generation is the right fit: documents change at runtime, and we
want answers traceable to source text. Each chunk carries its **page number**, so the
LLM can produce citations (`[n] filename p.X`) that the UI renders as verifiable snippets.

**Per-page extraction + overlapping chunks.** `pdf-parse`'s `pagerender` hook gives
text per page, which is what makes page-level citations possible. Chunks are ~180-word
windows with 40-word overlap so a fact spanning a boundary isn't lost. Chunks shorter
than a threshold are dropped to avoid embedding noise (headers/footers).

**Gemini for both embeddings and generation.** `text-embedding-004` (768-dim) with
the correct `taskType` (`RETRIEVAL_DOCUMENT` for chunks, `RETRIEVAL_QUERY` for
questions) materially improves retrieval quality. Embeddings are batched
(`batchEmbedContents`, 100/req) to keep ingestion fast. `gemini-2.5-flash` is cheap,
fast, and strong enough for grounded synthesis.

**Postgres + pgvector as the vector store.** Reuses the existing Postgres/Neon
instance the team already runs — one datastore, SQL-native metadata filtering (e.g.
scoping a query to selected documents via `document_id = ANY(...)`), and an
`ivfflat` cosine index for ANN search. No extra infra to operate for a prototype.

**Connection pooling + a thin query helper** mirror the existing Python service
pattern (pooled connections, `search_path` set to the `sensiwise` schema), keeping the
code consistent with the rest of the stack and avoiding per-request connection cost.

## Trade-offs

- **ivfflat vs exact search** — ivfflat is approximate; for the small corpus in a demo
  it's effectively exact and far faster at scale. `lists=100` is a reasonable default;
  it should be tuned to row count for a large corpus.
- **In-memory session memory** — simple and good enough for the demo; it doesn't
  survive a restart and isn't multi-instance safe. Production would persist to Postgres/Redis.
- **Similarity as a confidence proxy** — cheap and explainable but not calibrated; a
  cross-encoder re-ranker or an LLM grader would be more robust.
- **Synchronous ingestion** — fine for typical PDFs; very large files would benefit from
  a background job + progress streaming.
- **In-memory upload buffers** with a 25 MB cap — avoids disk churn; large-scale use
  would stream to object storage.

## Challenges encountered

- **Per-page text with `pdf-parse`** required the `pagerender` callback (the default
  API returns one concatenated string), so page citations needed custom rendering.
- **pgvector parameter binding** — vectors are passed as a `[...]` literal cast with
  `::vector`; chunk inserts are batched into a single multi-row statement for speed.
- **Embedding task types** — using query vs document task types (not a single generic
  type) noticeably improved retrieval relevance.

## What I'd improve with more time

- **Streaming responses** (token-by-token) for snappier UX.
- **A re-ranking stage** (cross-encoder) before generation for higher precision.
- **Highlight-in-PDF** — render the source page and highlight the cited span.
- **Auth + per-user document isolation**, and **Docker Compose** (Postgres+pgvector,
  API, UI) for one-command setup.
- **Evaluation harness** — a small labelled Q/A set to track retrieval hit-rate and
  answer faithfulness across changes.
- **OCR fallback** (e.g. Tesseract) for scanned/image-only PDFs, which currently
  produce no extractable text.
