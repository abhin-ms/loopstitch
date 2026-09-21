import { useEffect, useRef, useState } from 'react'
import client, { mediaUrl } from '../../api/client'
import Loader from '../../components/Loader'

const MAX_MB = 25
const btn = 'border border-panel-2 px-3 py-2 font-mono text-[11px] uppercase tracking-widest'

export default function AdminInstagram() {
  const [videos, setVideos] = useState(null)
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)

  // video upload
  const fileRef = useRef(null)
  const [link, setLink] = useState('')
  const [progress, setProgress] = useState(null)
  const [videoError, setVideoError] = useState(null)

  // embedded post link
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    client.get('/api/admin/instagram/videos').then((res) => setVideos(res.data)).catch(() => setError('Failed to load videos'))
    client.get('/api/admin/instagram').then((res) => setPosts(res.data)).catch(() => setError('Failed to load posts'))
  }
  useEffect(() => { load() }, [])

  const upload = async (e) => {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setVideoError(null)
    if (file.size > MAX_MB * 1024 * 1024) { setVideoError(`That video is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB.`); return }
    const body = new FormData()
    body.append('file', file)
    body.append('link_url', link)
    setProgress(0)
    try {
      await client.post('/api/admin/instagram/videos', body, { onUploadProgress: (ev) => setProgress(Math.round((ev.loaded / (ev.total || file.size)) * 100)) })
      fileRef.current.value = ''
      setLink('')
      load()
    } catch (err) {
      const d = err.response?.data?.detail
      setVideoError(err.response?.status === 413 ? `The server rejected the file as too large (limit ${MAX_MB} MB).` : typeof d === 'string' ? d : 'Upload failed. Please try again.')
    } finally {
      setProgress(null)
    }
  }
  const toggleVideo = async (v) => { await client.patch(`/api/admin/instagram/videos/${v.id}/toggle`).catch(() => alert('Failed to update.')); load() }
  const removeVideo = async (v) => {
    if (!confirm('Delete this video from the website?')) return
    await client.delete(`/api/admin/instagram/videos/${v.id}`).catch(() => alert('Failed to delete.'))
    load()
  }

  const addPost = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await client.post('/api/admin/instagram', { url })
      setUrl('')
      load()
    } catch (err) {
      const d = err.response?.data?.detail
      setError(typeof d === 'string' ? d : 'Could not add that link.')
    } finally {
      setBusy(false)
    }
  }
  const togglePost = async (p) => { await client.patch(`/api/admin/instagram/${p.id}/toggle`).catch(() => alert('Failed to update.')); load() }
  const removePost = async (p) => {
    if (!confirm('Remove this post from the website?')) return
    await client.delete(`/api/admin/instagram/${p.id}`).catch(() => alert('Failed to remove.'))
    load()
  }

  if ((!videos || !posts) && !error) return <Loader label="Loading" />
  const input = 'bg-panel border border-panel-2 px-3.5 py-2.5 text-sm text-paper focus:border-acid outline-none'

  return (
    <div className="max-w-3xl space-y-12">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl uppercase text-paper mb-2">Instagram</h1>
        <p className="font-mono text-[11px] text-slate">Shown on the home page under &ldquo;Fresh off the feed&rdquo;.</p>
      </div>

      {videos && posts && videos.filter((v) => v.is_active).length === 0 && posts.some((x) => x.is_active) && (
        <div className="border border-riot p-4" role="status">
          <p className="font-mono text-xs uppercase tracking-widest text-riot mb-1">Your home page is showing embedded posts</p>
          <p className="text-sm text-paper/80 leading-relaxed">
            Instagram&rsquo;s own player shows the profile name and header, and it cannot autoplay. To get autoplaying reels with just an &ldquo;Instagram&rdquo; label, upload the video files under <strong>Reel videos</strong> below. As soon as one active video exists, the embedded posts are hidden.
          </p>
        </div>
      )}

      {/* ---- autoplay videos ---- */}
      <section aria-labelledby="reels-h">
        <h2 id="reels-h" className="font-mono text-xs uppercase tracking-widest text-acid mb-2">Reel videos (recommended)</h2>
        <p className="font-mono text-[11px] text-slate mb-5">
          Upload the video file of your reel. It plays muted on a loop in a swipeable strip, with only an &ldquo;Instagram&rdquo; label on top, and tapping it opens your post.
          MP4 (H.264) works everywhere. Up to {MAX_MB} MB, and vertical 9:16 videos look best. The newest 8 active videos are shown.
        </p>

        <form onSubmit={upload} className="border border-panel-2 p-4 space-y-3 mb-6">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Video file</span>
            <input ref={fileRef} type="file" required accept="video/mp4,video/webm,video/quicktime" className="font-mono text-xs text-slate w-full" />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate block mb-1.5">Instagram link for the label (optional, defaults to your profile)</span>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.instagram.com/reel/..." className={`${input} w-full font-mono`} />
          </label>
          {videoError && <p className="font-mono text-xs text-riot" role="alert">{videoError}</p>}
          <button disabled={progress !== null} className="bg-riot text-ink font-mono text-xs uppercase tracking-widest px-6 py-3 hover:bg-acid transition-colors disabled:opacity-60">
            {progress !== null ? `Uploading… ${progress}%` : 'Upload video'}
          </button>
          {progress !== null && <div className="h-1.5 bg-panel-2" aria-hidden="true"><div className="h-full bg-acid transition-all" style={{ width: `${progress}%` }} /></div>}
        </form>

        <div className="space-y-3">
          {videos?.length === 0 && <p className="font-mono text-sm text-slate">No videos yet.</p>}
          {videos?.map((v) => (
            <div key={v.id} className="border border-panel-2 bg-panel p-3 flex items-center gap-4">
              <video src={`${mediaUrl(v.video_url)}#t=0.1`} muted playsInline preload="metadata" className="w-14 h-24 object-cover bg-ink shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className={`font-mono text-[11px] ${v.is_active ? 'text-acid' : 'text-slate'}`}>{v.is_active ? 'Showing on site' : 'Hidden'}</p>
                <p className="font-mono text-[11px] text-slate truncate">{v.link_url || 'Links to your profile'}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => toggleVideo(v)} className={`${btn} text-paper hover:border-acid hover:text-acid`}>{v.is_active ? 'Hide' : 'Show'}</button>
                <button onClick={() => removeVideo(v)} className={`${btn} text-slate hover:border-riot hover:text-riot`}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---- embedded posts (fallback) ---- */}
      <section aria-labelledby="embed-h">
        <h2 id="embed-h" className="font-mono text-xs uppercase tracking-widest text-acid mb-2">Embedded posts (fallback)</h2>
        <p className="font-mono text-[11px] text-slate mb-5">
          Paste a public post or reel link. Instagram&rsquo;s own player shows the profile name and can&rsquo;t autoplay, so these only appear when you have <strong>no</strong> uploaded videos above.
        </p>
        <form onSubmit={addPost} className="flex flex-col sm:flex-row gap-2 mb-3">
          <label className="sr-only" htmlFor="ig-url">Instagram post or reel link</label>
          <input id="ig-url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://www.instagram.com/reel/..." className={`${input} flex-1 font-mono`} />
          <button disabled={busy} className="bg-riot text-ink font-mono text-xs uppercase tracking-widest px-6 py-3 hover:bg-acid transition-colors disabled:opacity-60">{busy ? 'Adding…' : 'Add post'}</button>
        </form>
        {error && <p className="font-mono text-xs text-riot mb-4" role="alert">{error}</p>}
        <div className="space-y-3 mt-6">
          {posts?.length === 0 && <p className="font-mono text-sm text-slate">No embedded posts.</p>}
          {posts?.map((p) => (
            <div key={p.id} className="border border-panel-2 bg-panel p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <a href={`https://www.instagram.com/${p.kind}/${p.shortcode}/`} target="_blank" rel="noopener noreferrer" className="font-mono text-sm text-paper hover:text-acid">
                  {p.kind === 'reel' ? 'Reel' : 'Post'} · {p.shortcode} ↗
                </a>
                <p className={`font-mono text-[11px] mt-1 ${p.is_active ? 'text-acid' : 'text-slate'}`}>{p.is_active ? 'Active' : 'Hidden'}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => togglePost(p)} className={`${btn} text-paper hover:border-acid hover:text-acid`}>{p.is_active ? 'Hide' : 'Show'}</button>
                <button onClick={() => removePost(p)} className={`${btn} text-slate hover:border-riot hover:text-riot`}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
