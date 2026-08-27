import type { Post } from '../../shared/types'
import { timeAgo } from '../timeAgo'

interface Props {
  post: Post
  currentUserId: string
  onOpen?: (post: Post) => void
  onAuthorClick?: (author: string) => void
  onLike: (post: Post) => void
  onDelete: (post: Post) => void
}

export default function PostCard({
  post,
  currentUserId,
  onOpen,
  onAuthorClick,
  onLike,
  onDelete,
}: Props) {
  const open = onOpen ? () => onOpen(post) : undefined

  return (
    <article
      className={`post${open ? ' clickable' : ''}`}
      onClick={open}
      // Opening a thread must work without a pointer.
      onKeyDown={
        open
          ? (event) => {
              if (event.target !== event.currentTarget) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                open()
              }
            }
          : undefined
      }
      tabIndex={open ? 0 : undefined}
      role={open ? 'link' : undefined}
    >
      <header className="post-head">
        <button
          className="link-button post-author"
          onClick={(e) => {
            e.stopPropagation()
            onAuthorClick?.(post.author)
          }}
        >
          {post.authorDisplayName !== post.author && (
            <span className="post-name">{post.authorDisplayName}</span>
          )}
          @{post.author}
        </button>
        <span className="post-time">{timeAgo(post.createdAt)}</span>
      </header>
      <p className="post-body">{post.body}</p>
      <footer className="post-actions">
        <button
          className={`action${post.likedByMe ? ' liked' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            onLike(post)
          }}
          aria-pressed={post.likedByMe}
          aria-label={post.likedByMe ? 'Unlike' : 'Like'}
        >
          {post.likedByMe ? '♥' : '♡'} {post.likeCount}
        </button>
        <span className="action">💬 {post.replyCount}</span>
        {post.authorId === currentUserId && (
          <button
            className="action delete"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(post)
            }}
          >
            Delete
          </button>
        )}
      </footer>
    </article>
  )
}
