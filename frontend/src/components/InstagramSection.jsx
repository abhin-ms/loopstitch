import { useEffect, useState } from 'react'
import client from '../api/client'

export default function InstagramSection() {
  const [posts, setPosts] = useState([])

  useEffect(() => {
    client.get('/api/instagram').then((res) => setPosts(res.data)).catch(() => {})
  }, [])

  if (posts.length === 0) return null

  return (
    <section className="border-y border-panel-2 bg-panel/45" aria-labelledby="ig-title">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <p className="font-mono text-xs text-riot tracking-widest uppercase mb-2">On Instagram</p>
        <h2 id="ig-title" className="font-display text-3xl sm:text-5xl uppercase text-paper mb-8">Fresh off the feed</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 justify-items-center">
          {posts.map((post) => (
            <div key={post.id} className="w-full max-w-[400px] h-[560px] sm:h-[600px] bg-panel border border-panel-2 overflow-hidden">
              <iframe
                title={`Instagram ${post.kind === 'reel' ? 'reel' : 'post'} from Loopstitch`}
                src={`https://www.instagram.com/${post.kind}/${post.shortcode}/embed/`}
                loading="lazy"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                className="w-full h-full border-0 bg-white"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
