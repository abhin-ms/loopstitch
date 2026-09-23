import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import client, { mediaUrl } from '../api/client'
import ProductSkeleton from '../components/ProductSkeleton'

export default function Blog() {
  const [posts, setPosts] = useState(null)

  useEffect(() => {
    document.title = 'Journal | Loopstitch Co.'
    client.get('/api/blog').then((res) => setPosts(res.data)).catch(() => setPosts([]))
    return () => { document.title = 'Loopstitch Co.' }
  }, [])

  return (
    <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
      <p className="font-mono text-xs text-riot tracking-widest uppercase mb-2">Journal</p>
      <h1 className="font-display text-4xl sm:text-5xl uppercase text-paper mb-10">Style notes &amp; drop stories</h1>
      {posts === null ? (
        <ProductSkeleton count={3} />
      ) : posts.length === 0 ? (
        <p className="font-mono text-sm text-slate py-16 text-center">First posts coming soon.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
          {posts.map((post) => (
            <Link key={post.id} to={`/blog/${post.slug}`} className="group block">
              <div className="aspect-[16/10] bg-panel overflow-hidden border border-panel-2">
                {post.cover_url && <img src={mediaUrl(post.cover_url)} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
              </div>
              <p className="font-mono text-[11px] text-slate uppercase tracking-widest mt-4">{new Date(post.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              <h2 className="font-display text-2xl uppercase text-paper mt-1 group-hover:text-acid transition-colors">{post.title}</h2>
              {post.excerpt && <p className="text-sm text-slate mt-2 leading-relaxed">{post.excerpt}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
