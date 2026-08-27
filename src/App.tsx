import { useCallback, useEffect, useState } from 'react'
import type { AuthenticatedUser, Post, Thread } from '../shared/types'
import * as api from './api'
import { RequestError } from './api'
import chirpMark from './assets/chirp-mark.png'
import AuthScreen from './components/AuthScreen'
import Composer from './components/Composer'
import PostCard from './components/PostCard'
import TokenScreen from './components/TokenScreen'

type View = { kind: 'feed'; author?: string } | { kind: 'thread'; id: string }

const message = (e: unknown) => (e instanceof Error ? e.message : 'something went wrong')

/** Email links land on their own paths; everything else is the app shell. */
const readEmailLink = (): { kind: 'reset-password' | 'verify-email'; token: string } | null => {
  const path = window.location.pathname.replace(/\/$/, '')
  if (path !== '/reset-password' && path !== '/verify-email') return null
  return {
    kind: path === '/reset-password' ? 'reset-password' : 'verify-email',
    token: new URLSearchParams(window.location.search).get('token') ?? '',
  }
}

export default function App() {
  const [emailLink, setEmailLink] = useState(readEmailLink)
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<View>({ kind: 'feed' })
  const [reloadKey, setReloadKey] = useState(0)
  const [posts, setPosts] = useState<Post[] | null>(null)
  const [thread, setThread] = useState<Thread | null>(null)
  const [error, setError] = useState('')

  const reload = () => setReloadKey((k) => k + 1)

  // The server owns the session; the client only asks who it is.
  useEffect(() => {
    let cancelled = false
    const bootstrap = async () => {
      try {
        const current = await api.me()
        if (!cancelled) setUser(current)
      } catch (e) {
        if (!cancelled && !(e instanceof RequestError && e.code === 'unauthenticated')) {
          setError(message(e))
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  const signedOut = useCallback(() => {
    setUser(null)
    setPosts(null)
    setThread(null)
    setView({ kind: 'feed' })
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const fetchView = async () => {
      try {
        if (view.kind === 'feed') {
          const next = await api.listPosts(view.author)
          if (cancelled) return
          setThread(null)
          setPosts(next)
        } else {
          const next = await api.getThread(view.id)
          if (cancelled) return
          setThread(next)
        }
        setError('')
      } catch (e) {
        if (cancelled) return
        if (e instanceof RequestError && e.code === 'unauthenticated') signedOut()
        else setError(message(e))
      }
    }
    void fetchView()
    return () => {
      cancelled = true
    }
  }, [user, view, reloadKey, signedOut])

  const signOut = async () => {
    try {
      await api.logout()
    } catch (e) {
      setError(message(e))
    }
    signedOut()
  }

  const run = async (fn: () => Promise<void>): Promise<boolean> => {
    try {
      await fn()
      setError('')
      return true
    } catch (e) {
      // A session that expired mid-action returns the user to sign-in rather
      // than leaving the UI in a state where nothing works.
      if (e instanceof RequestError && e.code === 'unauthenticated') {
        signedOut()
        setError('your session expired — sign in again')
        return false
      }
      setError(message(e))
      return false
    }
  }

  const like = (post: Post) =>
    run(async () => {
      const { likeCount, likedByMe } = await api.toggleLike(post.id)
      const patch = (p: Post) => (p.id === post.id ? { ...p, likeCount, likedByMe } : p)
      setPosts((prev) => prev?.map(patch) ?? prev)
      setThread((prev) =>
        prev ? { post: patch(prev.post), replies: prev.replies.map(patch) } : prev,
      )
    })

  const remove = (post: Post) =>
    run(async () => {
      await api.deletePost(post.id)
      if (view.kind === 'thread' && view.id === post.id) setView({ kind: 'feed' })
      else reload()
    })

  const publish = (body: string, parentId?: string) =>
    run(async () => {
      await api.createPost(body, parentId)
      reload()
    })

  if (emailLink) {
    return (
      <TokenScreen
        kind={emailLink.kind}
        token={emailLink.token}
        onDone={() => {
          window.history.replaceState(null, '', '/')
          setEmailLink(null)
        }}
      />
    )
  }

  if (!ready) return <p className="empty">Loading…</p>
  if (!user) return <AuthScreen onSignedIn={setUser} />

  const openThread = (post: Post) => setView({ kind: 'thread', id: post.id })
  const openAuthor = (author: string) => setView({ kind: 'feed', author })

  return (
    <div className="app">
      <header className="header">
        <h1>
          <button className="link-button brand" onClick={() => setView({ kind: 'feed' })}>
            <img className="brand-mark" src={chirpMark} alt="" width={30} height={30} />
            Chirp
          </button>
        </h1>
        <span className="who">
          @{user.username} ·{' '}
          <button className="link-button" onClick={() => void signOut()}>
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
              currentUserId={user.id}
              onOpen={openThread}
              onAuthorClick={openAuthor}
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
              {thread.post.parentId && (
                <div className="back">
                  <button
                    className="link-button"
                    onClick={() => setView({ kind: 'thread', id: thread.post.parentId! })}
                  >
                    ↑ view the post this replies to
                  </button>
                </div>
              )}
              <PostCard
                post={thread.post}
                currentUserId={user.id}
                onAuthorClick={openAuthor}
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
                  currentUserId={user.id}
                  // Replies open their own thread, so nested replies stay
                  // reachable instead of being accepted and then hidden.
                  onOpen={openThread}
                  onAuthorClick={openAuthor}
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
