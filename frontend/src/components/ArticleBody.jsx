// Renders journal text written in the admin, without HTML:
// blank line = new paragraph, "## " = heading, lines starting with "- " = bullet list.
export default function ArticleBody({ text }) {
  const blocks = (text || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className="space-y-5 text-paper/80 leading-relaxed">
      {blocks.map((block, i) => {
        if (block.startsWith('## ')) return <h2 key={i} className="font-display text-2xl sm:text-3xl uppercase text-paper pt-4">{block.slice(3)}</h2>
        const lines = block.split('\n')
        if (lines.every((l) => l.trim().startsWith('- '))) {
          return <ul key={i} className="list-disc pl-5 space-y-1.5">{lines.map((l, j) => <li key={j}>{l.trim().slice(2)}</li>)}</ul>
        }
        return <p key={i} className="whitespace-pre-line">{block}</p>
      })}
    </div>
  )
}
