// One-time DB setup: create the sensiwise schema, pgvector extension, and tables.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
await pool.query(sql);

// ivfflat with lists >= row count returns zero results for some queries — rebuild safely.
await pool.query("DROP INDEX IF EXISTS sensiwise.idx_chunks_embedding");
const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM sensiwise.chunks");
const n = rows[0]?.n || 0;
if (n >= 1) {
  const lists = Math.max(1, Math.min(1000, Math.floor(Math.sqrt(n))));
  await pool.query(
    `CREATE INDEX idx_chunks_embedding ON sensiwise.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = ${lists})`
  );
  console.log(`Vector index rebuilt (rows=${n}, lists=${lists}).`);
}

console.log("Schema 'sensiwise' ready (documents, chunks, pgvector index).");
await pool.end();
