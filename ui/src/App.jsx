import { useState, useRef, useEffect } from "react";
import { listDocuments, uploadDocuments, deleteDocument, askQuestion } from "./api";
import MarkdownAnswer from "./MarkdownAnswer";

const mkSession = () => "web-" + Math.random().toString(36).slice(2, 9);

function Sources({ sources }) {
  const [open, setOpen] = useState(false);
  if (!sources?.length) return null;
  return (
    <div className="sources">
      <button className="src-toggle" onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {sources.length} source{sources.length > 1 ? "s" : ""}
      </button>
      {open ? (
        <div className="src-list">
          {sources.map((s) => (
            <div className="src-card" key={s.n}>
              <div className="src-head">
                <b>[{s.n}]</b> {s.filename} · p.{s.page}
                <span className="sim">{(s.similarity * 100).toFixed(0)}%</span>
              </div>
              <div className="src-snippet">{s.snippet}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="src-chips">
          {sources.map((s) => (
            <span className="chip" key={s.n} title={s.snippet}>
              [{s.n}] {s.filename} p.{s.page}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Message({ m }) {
  if (m.role === "user")
    return <div className="row user"><div className="bubble user">{m.text}</div></div>;
  return (
    <div className="row bot">
      <div className="bubble bot">
        {m.loading ? (
          <span className="typing"><i /><i /><i /></span>
        ) : (
          <>
            <MarkdownAnswer text={m.text} />
            <div className="meta-row">
              {m.confidence != null && (
                <span className={`badge ${m.confidence >= 0.7 ? "high" : m.confidence >= 0.5 ? "mid" : "low"}`}>
                  relevance {(m.confidence * 100).toFixed(0)}%
                </span>
              )}
              {m.latencyMs != null && <span className="lat">{m.latencyMs} ms</span>}
            </div>
            <Sources sources={m.sources} />
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [docs, setDocs] = useState([]);
  const [selected, setSelected] = useState([]); // [] = all docs
  const [sessionId, setSessionId] = useState(() => mkSession());
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const pendingRef = useRef(0);
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  const refresh = () => listDocuments().then(setDocs).catch(() => {});
  useEffect(() => { refresh(); }, []);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);

  async function onUpload(files) {
    if (!files?.length) return;
    setUploading(true);
    try {
      await uploadDocuments(files);
      await refresh();
    } catch (e) {
      alert("Upload failed: " + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDelete(id) {
    await deleteDocument(id);
    setSelected((s) => s.filter((x) => x !== id));
    refresh();
  }

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function startNewChat() {
    if (messages.length && !window.confirm("Starting a new chat will discard this conversation. Continue?")) return;
    setSessionId(mkSession());
    setMessages([]);
    setInput("");
  }

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    if (!docs.length) { alert("Upload a PDF first."); return; }
    setInput("");
    setBusy(true);
    const reqId = ++pendingRef.current;
    setMessages((m) => [...m, { role: "user", text: q }, { role: "bot", loading: true, reqId }]);
    try {
      const data = await askQuestion(q, selected.length ? selected : null, sessionRef.current);
      setMessages((m) => {
        const idx = m.findIndex((msg) => msg.loading && msg.reqId === reqId);
        if (idx === -1) return m;
        return [
          ...m.slice(0, idx),
          {
            role: "bot",
            text: data.error ? "Error: " + data.error : data.answer,
            sources: data.sources || [],
            confidence: data.confidence,
            latencyMs: data.latencyMs,
          },
          ...m.slice(idx + 1),
        ];
      });
    } catch (e) {
      setMessages((m) => {
        const idx = m.findIndex((msg) => msg.loading && msg.reqId === reqId);
        if (idx === -1) return m;
        return [
          ...m.slice(0, idx),
          { role: "bot", text: "Network error: " + e.message },
          ...m.slice(idx + 1),
        ];
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="logo">S</div>
          <div>
            <h1>Sensiwise</h1>
            <p>Document Intelligence</p>
          </div>
        </div>

        <div
          className={`drop ${uploading ? "busy" : ""}`}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onUpload(e.dataTransfer.files); }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => onUpload(e.target.files)}
          />
          {uploading ? "Processing…" : (<><b>+ Upload PDF</b><span>click or drop files</span></>)}
        </div>

        <div className="doc-head">
          <span>Documents ({docs.length})</span>
          {selected.length > 0 && (
            <button className="clear" onClick={() => setSelected([])}>querying {selected.length} · all</button>
          )}
        </div>
        <div className="doc-list">
          {docs.length === 0 && <p className="empty-docs">No documents yet.</p>}
          {docs.map((d) => (
            <div key={d.id} className={`doc ${selected.includes(d.id) ? "sel" : ""}`}>
              <label>
                <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} />
                <div className="doc-info">
                  <span className="doc-name" title={d.filename}>{d.filename}</span>
                  <span className="doc-meta">{d.pages} pages · {d.chunk_count} chunks</span>
                </div>
              </label>
              <button className="del" onClick={() => onDelete(d.id)} title="Delete">×</button>
            </div>
          ))}
        </div>
        <p className="hint">
          {selected.length ? `Scoped to ${selected.length} selected document(s).` : "Querying all documents."}
        </p>
      </aside>

      <main>
        <div className="chat-bar">
          <span className="chat-label">Chat</span>
          <button type="button" className="new-chat" onClick={startNewChat} disabled={busy}>
            New chat
          </button>
        </div>
        <div className="chat">
          {messages.length === 0 && (
            <div className="welcome">
              <h2>Ask questions about your PDFs</h2>
              <p>Upload a document, then ask anything. Answers cite the exact page and excerpt used.</p>
            </div>
          )}
          {messages.map((m, i) => <Message key={i} m={m} />)}
          <div ref={endRef} />
        </div>
        <div className="composer">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={docs.length ? "Ask a question about your documents…" : "Upload a PDF to begin…"}
            disabled={busy}
          />
          <button onClick={send} disabled={busy || !input.trim()}>Send</button>
        </div>
      </main>
    </div>
  );
}
