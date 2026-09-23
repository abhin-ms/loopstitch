import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import client, { mediaUrl } from '../api/client'
import Loader from '../components/Loader'
import ArticleBody from '../components/ArticleBody'
import { removeServerLd } from '../utils/serverLd'

export default function BlogPost() {
  const { slug } = useParams()
  const [post, setPost] = useState(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    setPost(null)
    setMissing(false)
    client.get(`/api/blog/${slug}`).then((res) => setPost(res.data)).catch(() => setMissing(true))
  }, [slug])

  useEffect(() => {
    if (!post) return undefined
    document.title = `${post.title} | Loopstitch Co.`
    const meta = document.head.querySelector('meta[name="description"]')
    const previous = meta?.getAttribute('content')
    if (meta && post.excerpt) meta.setAttribute('content', post.excerpt)
    removeServerLd('BlogPosting')
    const ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.dataset.appLd = 'true'
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.excerpt,
      datePublished: post.published_at, dateModified: post.updated_at, image: post.cover_url ? mediaUrl(post.cover_url) : undefined,
      author: { '@type': 'Organization', name: 'Loopstitch Co.' },
    })
    document.head.appendChild(ld)
    return () => { ld.remove(); document.title = 'Loopstitch Co.'; if (meta && previous) meta.setAttribute('content', previous) }
  }, [post])

  if (missing) {
    return (
      <div className="max-w-3xl mx-auto px-5 py-24 text-center">
        <p className="font-mono text-slate mb-4">This article doesn&apos;t exist or was removed.</p>
        <Link to="/blog" className="text-acid font-mono text-xs uppercase tracking-widest">← Back to the journal</Link>
      </div>
    )
  }
  if (!post) return <Loader label="Loading article" />

  return (
    <article className="max-w-3xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
      <Link to="/blog" className="font-mono text-xs text-slate hover:text-paper uppercase tracking-widest py-2 inline-block mb-6">← Journal</Link>
      <p className="font-mono text-[11px] text-slate uppercase tracking-widest">{new Date(post.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      <h1 className="font-display text-4xl sm:text-6xl uppercase text-paper leading-none mt-2 mb-6">{post.title}</h1>
      {post.cover_url && <img src={mediaUrl(post.cover_url)} alt="" className="w-full aspect-[16/9] object-cover border border-panel-2 mb-8" fetchPriority="high" />}
      <ArticleBody text={post.body} />
      <div className="mt-14 border border-panel-2 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="font-display text-2xl uppercase text-paper">Find your next oversized tee</p>
        <Link to="/shop" className="bg-riot text-ink font-mono text-xs uppercase tracking-widest px-6 py-3.5 hover:bg-acid transition-colors text-center">Shop the drop →</Link>
      </div>
    </article>
  )
}
