/** Minimal chat markdown — Verso-style, no extra deps. */

function FmtInline({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*.+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (/^`[^`]+`$/.test(p)) return <code key={i}>{p.slice(1, -1)}</code>;
        if (/^\[\d+\]$/.test(p)) return <span key={i} className="md-cite">{p}</span>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export default function MarkdownAnswer({ text }) {
  if (!text) return null;
  const lines = text.split("\n");

  return (
    <div className="answer-md">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="md-gap" aria-hidden />;

        const bullet = trimmed.match(/^[-*•]\s+(.+)/);
        if (bullet) {
          return (
            <div key={i} className="md-li">
              <span className="md-bullet" aria-hidden>•</span>
              <span><FmtInline text={bullet[1]} /></span>
            </div>
          );
        }

        const num = trimmed.match(/^(\d+)\.\s+(.+)/);
        if (num) {
          return (
            <div key={i} className="md-li md-num">
              <span className="md-num-label">{num[1]}.</span>
              <span><FmtInline text={num[2]} /></span>
            </div>
          );
        }

        const heading = trimmed.match(/^#{1,3}\s+(.+)/);
        if (heading) {
          return (
            <div key={i} className="md-h">
              <FmtInline text={heading[1]} />
            </div>
          );
        }

        return (
          <div key={i} className="md-p">
            <FmtInline text={line} />
          </div>
        );
      })}
    </div>
  );
}
