-- Sensiwise Document Intelligence — pgvector schema.
CREATE SCHEMA IF NOT EXISTS sensiwise;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS sensiwise.documents (
    id          SERIAL PRIMARY KEY,
    filename    TEXT NOT NULL,
    pages       INTEGER,
    chunk_count INTEGER DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensiwise.chunks (
    id          SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES sensiwise.documents(id) ON DELETE CASCADE,
    chunk_text  TEXT NOT NULL,
    page        INTEGER,
    chunk_index INTEGER,
    embedding   vector(768),          -- text-embedding-004 dimension
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON sensiwise.chunks(document_id);
-- ivfflat lists must stay well below row count; setup.js rebuilds this after ingest.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON sensiwise.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 1);
