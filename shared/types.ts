/** Contracts shared by the Worker API and every client (web today, native later). */

export const MAX_POST_LENGTH = 280
export const MAX_DISPLAY_NAME_LENGTH = 50
export const MAX_BIO_LENGTH = 160
export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 200
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type AccountStatus = 'active' | 'suspended' | 'deactivated'

/** A user as any client may see them. Never carries credentials. */
export interface PublicUser {
  id: string
  username: string
  displayName: string
  bio: string
  avatarUrl: string | null
  createdAt: number
}

/** The authenticated user's own record: adds fields only they may read. */
export interface AuthenticatedUser extends PublicUser {
  email: string | null
  emailVerified: boolean
  status: AccountStatus
}

export interface Post {
  id: string
  authorId: string
  author: string
  authorDisplayName: string
  body: string
  createdAt: number
  likeCount: number
  likedByMe: boolean
  replyCount: number
  parentId: string | null
}

export interface Thread {
  post: Post
  replies: Post[]
}

export interface CreatePostBody {
  body: string
  parentId?: string | null
}

export interface LikeResult {
  likeCount: number
  likedByMe: boolean
}

export interface RegisterBody {
  username: string
  password: string
  email?: string | null
  displayName?: string | null
}

export interface LoginBody {
  username: string
  password: string
}

export interface PasswordResetRequestBody {
  username: string
}

export interface PasswordResetBody {
  token: string
  password: string
}

export interface VerifyEmailBody {
  token: string
}

export interface SessionResponse {
  user: AuthenticatedUser
  /**
   * Bearer token for clients that cannot use cookies (native apps). Browsers
   * receive the same session as an HttpOnly cookie and should ignore this.
   */
  token: string
  expiresAt: number
}

/**
 * Machine-readable error codes. Clients switch on `code`; `error` is only for
 * display, and `fields` carries per-field validation messages.
 */
export type ApiErrorCode =
  | 'validation_error'
  | 'unauthenticated'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'internal_error'

export interface ApiError {
  code: ApiErrorCode
  error: string
  fields?: Record<string, string>
  retryAfter?: number
}
