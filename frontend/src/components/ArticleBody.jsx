import { Link } from 'react-router-dom'

// Inline Markdown: **bold** and [text](url). Site links (/shop) stay inside the app.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="text-paper">{part.slice(2, -2)}</strong>
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) {
      const [, label, href] = link
      if (href.startsWith('/')) return <Link key={i} to={href} className="text-acid underline underline-offset-4">{label}</Link>
      if (/^https?:\/\//.test(href)) return <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-acid underline underline-offset-4">{label}</a>
    }
    return part
  })
}

// Renders journal text written in the admin as Markdown, without raw HTML:
// blank line = new paragraph, "## " / "### " = headings, lines starting with "- " = bullet list,
// "| a | b |" lines = table, **bold** and [text](url) inside any of them.
export default function ArticleBody({ text }) {
  const blocks = (text || '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className="space-y-5 text-paper/80 leading-relaxed">
      {blocks.map((block, i) => {
        if (block.startsWith('### ')) return <h3 key={i} className="font-display text-xl sm:text-2xl uppercase text-paper pt-2">{inline(block.slice(4))}</h3>
        if (block.startsWith('## ')) return <h2 key={i} className="font-display text-2xl sm:text-3xl uppercase text-paper pt-4">{inline(block.slice(3))}</h2>
        const lines = block.split('\n').map((l) => l.trim())
        if (lines.every((l) => l.startsWith('- '))) {
          return <ul key={i} className="list-disc pl-5 space-y-1.5">{lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}</ul>
        }
        if (lines.length > 1 && lines.every((l) => l.startsWith('|') && l.endsWith('|'))) {
          const rows = lines.filter((l) => !/^\|[\s:|-]+\|$/.test(l)).map((l) => l.slice(1, -1).split('|').map((c) => c.trim()))
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full text-sm font-mono border border-panel-2">
                <thead><tr>{rows[0].map((c, j) => <th key={j} className="text-left text-paper px-3 py-2 border-b border-panel-2">{inline(c)}</th>)}</tr></thead>
                <tbody>{rows.slice(1).map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="px-3 py-2 border-b border-panel-2">{inline(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )
        }
        return <p key={i} className="whitespace-pre-line">{inline(block)}</p>
      })}
    </div>
  )
}
