import { useEffect, useState } from 'react'
import client from '../api/client'
import ReelsCarousel from './ReelsCarousel'
import { SOCIAL } from '../utils/social'

export default function InstagramSection() {
  const [videos, setVideos] = useState([])
  const [embeds, setEmbeds] = useState([])

  useEffect(() => {
    client.get('/api/instagram/videos').then((res) => setVideos(res.data)).catch(() => {})
    client.get('/api/instagram').then((res) => setEmbeds(res.data)).catch(() => {})
  }, [])

  // Uploaded reels give the clean autoplay look; embedded posts are only a fallback when there are none.
  if (videos.length === 0 && embeds.length === 0) return null

  return (
    <section className="border-y border-panel-2 bg-panel/45" aria-labelledby="ig-title">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
          <div>
            <p className="font-mono text-xs text-riot tracking-widest uppercase mb-2">On Instagram</p>
            <h2 id="ig-title" className="font-display text-3xl sm:text-5xl uppercase text-paper">Fresh off the feed</h2>
          </div>
          <a href={SOCIAL.instagram.url} target="_blank" rel="noopener noreferrer" className="font-mono text-xs uppercase tracking-widest text-slate hover:text-acid transition-colors py-2">
            {SOCIAL.instagram.handle} ↗
          </a>
        </div>

        {videos.length > 0 ? (
          <ReelsCarousel videos={videos} />
        ) : (
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-px-5 sm:scroll-px-0 pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {embeds.map((post) => (
              <div key={post.id} className="w-[86vw] max-w-[400px] h-[560px] sm:h-[600px] shrink-0 snap-start bg-panel border border-panel-2 overflow-hidden">
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
        )}
      </div>
    </section>
  )
}
