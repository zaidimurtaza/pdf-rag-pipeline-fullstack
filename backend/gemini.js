// Gemini wrappers using the new @google/genai SDK (mirrors the reference Python google-genai usage).
//   generation: gemini-2.5-flash   embeddings: text-embedding-004 / gemini-embedding-001 (768 dims)
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEN_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
export const EMBED_DIM = Number(process.env.EMBEDDING_DIM || 768);

// Try the configured model first, then fall back — keys differ in which embedding model they expose.
const CANDIDATES = [
  ...(process.env.EMBEDDING_MODEL ? [process.env.EMBEDDING_MODEL.replace(/^models\//, "")] : []),
  "text-embedding-004",
  "gemini-embedding-001",
];
let _resolved = null;

async function embedRaw(contents, taskType) {
  const errs = [];
  for (const model of _resolved ? [_resolved] : CANDIDATES) {
    try {
      const r = await ai.models.embedContent({
        model,
        contents,
        config: { taskType, outputDimensionality: EMBED_DIM },
      });
      _resolved = model;
      return r.embeddings.map((e) => e.values);
    } catch (e) {
      errs.push(`${model}: ${e.message}`);
    }
  }
  throw new Error("Embedding failed for all models — " + errs.join(" | "));
}

// taskType: RETRIEVAL_QUERY for questions, RETRIEVAL_DOCUMENT for stored chunks.
export async function embed(text, taskType = "RETRIEVAL_QUERY") {
  return (await embedRaw(text, taskType))[0];
}

// Batch embeddings for ingestion (chunked to keep requests small).
export async function embedBatch(texts, taskType = "RETRIEVAL_DOCUMENT") {
  const out = [];
  for (let i = 0; i < texts.length; i += 100) {
    out.push(...(await embedRaw(texts.slice(i, i + 100), taskType)));
  }
  return out;
}

export async function generate(prompt) {
  const r = await ai.models.generateContent({ model: GEN_MODEL, contents: prompt });
  return r.text;
}

// pgvector literal: [0.1,0.2,...]
export const toVector = (arr) => `[${arr.join(",")}]`;
