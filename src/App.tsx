import { useEffect, useState } from 'react'
import type { Post } from '../shared/types'
import * as api from './api'
import Composer from './components/Composer'
import Login from './components/Login'
import PostCard from './components/PostCard'

const STORAGE_KEY = 'chirp:user'

type View = { kind: 'feed'; author?: string } | { kind: 'thread'; id: string }

const message = (e: unknown) => (e instanceof Error ? e.message : 'something went wrong')

export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem(STORAGE_KEY) ?? '')
  const [view, setView] = useState<View>({ kind: 'feed' })
  const [reloadKey, setReloadKey] = useState(0)
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [thread, setThread] = useState<{ post: Post; replies: Post[] } | null>(null)
  const [error, setError] = useState('')

  const reload = () => setReloadKey((k) => k + 1)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const fetchView = async () => {
      try {
        if (view.kind === 'feed') {
          const next = await api.listPosts(user, view.author)
          if (cancelled) return
          setThread(null)
          setPosts(next)
        } else {
          const next = await api.getThread(user, view.id)
          if (cancelled) return
          setThread(next)
        }
        setError('')
      } catch (e) {
        if (!cancelled) setError(message(e))
      }
    }
    void fetchView()
    return () => {
      cancelled = true
    }
  }, [user, view, reloadKey])

  const signIn = (username: string) => {
    localStorage.setItem(STORAGE_KEY, username)
    setUser(username)
  }

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY)
    setUser('')
    setPosts(null)
    setView({ kind: 'feed' })
  }

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn()
      setError('')
    } catch (e) {
      setError(message(e))
    }
  }

  const like = (post: Post) =>
    run(async () => {
      const { likeCount, likedByMe } = await api.toggleLike(user, post.id)
      const patch = (p: Post) => (p.id === post.id ? { ...p, likeCount, likedByMe } : p)
      setPosts((prev) => prev?.map(patch) ?? prev)
      setThread((prev) =>
        prev ? { post: patch(prev.post), replies: prev.replies.map(patch) } : prev,
      )
    })

  const remove = (post: Post) =>
    run(async () => {
      await api.deletePost(user, post.id)
      if (view.kind === 'thread' && view.id === post.id) setView({ kind: 'feed' })
      else reload()
    })

  const publish = (body: string, parentId?: string) =>
    run(async () => {
      await api.createPost(user, body, parentId)
      reload()
    })

  if (!user) return <Login onSignIn={signIn} />

  return (
    <div className="app">
      <header className="header">
        <h1>
          <button className="link-button" onClick={() => setView({ kind: 'feed' })}>
            Chirp
          </button>
        </h1>
        <span className="who">
          @{user} ·{' '}
          <button className="link-button" onClick={signOut}>
            sign out
          </button>
        </span>
      </header>

      {error && <p className="error">{error}</p>}

      {view.kind === 'feed' ? (
        <>
          <Composer
            placeholder="What's happening?"
            submitLabel="Chirp"
            onSubmit={(body) => publish(body)}
          />
          {view.author && (
            <div className="back">
              Posts by @{view.author} ·{' '}
              <button className="link-button" onClick={() => setView({ kind: 'feed' })}>
                back to feed
              </button>
            </div>
          )}
          {posts?.length === 0 && <p className="empty">Nothing here yet.</p>}
          {posts?.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={user}
              onOpen={(p) => setView({ kind: 'thread', id: p.id })}
              onAuthorClick={(author) => setView({ kind: 'feed', author })}
              onLike={like}
              onDelete={remove}
            />
          ))}
        </>
      ) : (
        <>
          <div className="back">
            <button className="link-button" onClick={() => setView({ kind: 'feed' })}>
              ← back to feed
            </button>
          </div>
          {thread && (
            <>
              <PostCard
                post={thread.post}
                currentUser={user}
                onAuthorClick={(author) => setView({ kind: 'feed', author })}
                onLike={like}
                onDelete={remove}
              />
              <Composer
                placeholder="Post your reply"
                submitLabel="Reply"
                onSubmit={(body) => publish(body, thread.post.id)}
              />
              {thread.replies.map((reply) => (
                <PostCard
                  key={reply.id}
                  post={reply}
                  currentUser={user}
                  onAuthorClick={(author) => setView({ kind: 'feed', author })}
                  onLike={like}
                  onDelete={remove}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
