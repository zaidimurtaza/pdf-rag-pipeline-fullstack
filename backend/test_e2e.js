// Self-validating end-to-end test: setup -> ingest the assignment PDF -> query -> assert.
// Exits 0 on PASS, non-zero on FAIL (so the result is observable via exit code).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool, query } from "./db.js";
import { ingest, retrieve, answer } from "./lib/rag.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = [];
const say = (...a) => { const s = a.join(" "); log.push(s); console.log(s); };

let code = 0;
try {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
  say("STEP 1 schema ok");

  const pdfPath = path.join(__dirname, "..", "Interview_Task_SensiwiseAI.pdf");
  const buf = fs.readFileSync(pdfPath);
  await query("DELETE FROM sensiwise.documents WHERE filename = $1", ["Interview_Task_SensiwiseAI.pdf"]);
  const doc = await ingest(buf, "Interview_Task_SensiwiseAI.pdf");
  say(`STEP 2 ingested doc id=${doc.id} pages=${doc.pages} chunks=${doc.chunk_count}`);
  if (!doc.chunk_count) throw new Error("no chunks embedded");

  const cases = [
    { q: "What is the submission deadline for this assessment?", expect: /72\s*hours/i },
    { q: "What technologies are preferred for the frontend and backend?", expect: /react|next|express|node/i },
    { q: "How long should the demo video be?", expect: /3|three|5|five|minute/i },
  ];
  let passed = 0;
  for (const { q, expect } of cases) {
    const ctx = await retrieve(q, { documentIds: [doc.id] });
    const a = await answer(q, ctx);
    const ok = expect.test(a);
    if (ok) passed++;
    say(`\n[${ok ? "PASS" : "FAIL"}] ${q}`);
    say(`   conf=${Number(ctx[0]?.similarity).toFixed(3)} pages=${ctx.map((c) => c.page).join(",")}`);
    say(`   A: ${a.replace(/\s+/g, " ").trim()}`);
  }

  // edge case: out-of-document question should NOT fabricate
  const ctx = await retrieve("What is the capital of France?", { documentIds: [doc.id] });
  const a = await answer("What is the capital of France?", ctx);
  say(`\n[edge] out-of-doc -> ${a.replace(/\s+/g, " ").trim()}`);

  say(`\nRESULT ${passed}/${cases.length} content assertions passed`);
  if (passed < cases.length) code = 2;
  else say("ALL OK");
} catch (e) {
  say("ERROR: " + e.stack);
  code = 1;
} finally {
  fs.writeFileSync(path.join(__dirname, "_e2e.log"), log.join("\n"), "utf8");
  await pool.end();
  process.exit(code);
}
