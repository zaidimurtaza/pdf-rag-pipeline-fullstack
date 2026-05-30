# Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                FRONTEND (React + Vite)                         │
│   • Upload area (drag/drop, multi-file)   • Document list + scope selector     │
│   • Chat: questions, answers, citation chips + expandable source snippets      │
└───────────────┬───────────────────────────────────────────────┬──────────────┘
                │ POST /api/upload (multipart)                    │ POST /api/query
                ▼                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Node + Express)                          │
│                                                                               │
│  INGEST PIPELINE (lib/rag.js → ingest)          QUERY PIPELINE (lib/rag.js)    │
│  ┌──────────────────────────────────────┐       ┌──────────────────────────┐  │
│  │ 1. pdf.js   extract text per page     │       │ 1. embed(question)       │  │
│  │ 2. chunk.js page-aware overlap chunks │       │ 2. retrieve() top-k      │  │
│  │ 3. gemini.embedBatch (768-dim)        │       │    cosine via pgvector   │  │
│  │ 4. bulk INSERT into sensiwise.chunks  │       │ 3. answer() w/ Gemini    │  │
│  └──────────────────────────────────────┘       │    + inline [n] citations│  │
│                                                  └──────────────────────────┘  │
│  Session memory (Map) for multi-turn follow-ups · structured request logging   │
└───────────────┬───────────────────────────────┬───────────────────────────────┘
                │                                 │
                ▼                                 ▼
   ┌─────────────────────────┐       ┌─────────────────────────────────────┐
   │  Google Gemini API      │       │     PostgreSQL + pgvector            │
   │  (@google/genai)        │       │   schema: sensiwise                  │
   │  • text-embedding-004   │       │   documents(id, filename, pages…)    │
   │  • gemini-2.5-flash     │       │                                      │
   └─────────────────────────┘       │   chunks(document_id, text, page,    │
                                      │          embedding vector(768))      │
                                      │   ivfflat cosine index               │
                                      └─────────────────────────────────────┘
```

## Components

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| Frontend | `App.jsx` | Upload, document list/scope, chat, citation rendering |
| API | `server.js` | Routes, multipart handling, session memory, logging |
| Document processing | `lib/pdf.js`, `lib/chunk.js` | Per-page extraction, page-aware overlapping chunks |
| Embeddings/LLM | `gemini.js` | `@google/genai`: `text-embedding-004` (embed/embedBatch, with fallback), `gemini-2.5-flash` (generate) |
| Vector store | `db.js` + pgvector | Cosine similarity search over `sensiwise.chunks` |
| Orchestration | `lib/rag.js` | `ingest()` and `retrieve()` + `answer()` |

## Request flows

**Upload:** `multipart → ingest() → [extract pages → chunk → embedBatch → bulk insert] → document row`

**Query:** `{question, documentIds?} → embed query → top-k cosine (scoped) → build cited context → gemini-2.5-flash → {answer, sources, confidence, latency}`
