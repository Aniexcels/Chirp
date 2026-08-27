import type { MouseEvent } from 'react'
import type { Post } from '../../shared/types'
import { timeAgo } from '../timeAgo'

const stopThen = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation()
  fn()
}

interface Props {
  post: Post
  currentUser: string
  onOpen?: (post: Post) => void
  onAuthorClick?: (author: string) => void
  onLike: (post: Post) => void
  onDelete: (post: Post) => void
}

export default function PostCard({
  post,
  currentUser,
  onOpen,
  onAuthorClick,
  onLike,
  onDelete,
}: Props) {
  return (
    <article
      className={`post${onOpen ? ' clickable' : ''}`}
      onClick={onOpen ? () => onOpen(post) : undefined}
    >
      <header className="post-head">
        <button
          className="link-button post-author"
          onClick={stopThen(() => onAuthorClick?.(post.author))}
        >
          @{post.author}
        </button>
        <span className="post-time">{timeAgo(post.createdAt)}</span>
      </header>
      <p className="post-body">{post.body}</p>
      <footer className="post-actions">
        <button
          className={`action${post.likedByMe ? ' liked' : ''}`}
          onClick={stopThen(() => onLike(post))}
          aria-pressed={post.likedByMe}
          aria-label={post.likedByMe ? 'Unlike' : 'Like'}
        >
          {post.likedByMe ? '♥' : '♡'} {post.likeCount}
        </button>
        <span className="action">💬 {post.replyCount}</span>
        {post.author === currentUser && (
          <button
            className="action delete"
            onClick={stopThen(() => onDelete(post))}
          >
            Delete
          </button>
        )}
      </footer>
    </article>
  )
}
