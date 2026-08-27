import type {
  ApiError,
  ApiErrorCode,
  AuthenticatedUser,
  LikeResult,
  Post,
  SessionResponse,
  Thread,
} from '../shared/types'

/** Carries the server's machine-readable code so callers can branch on it. */
export class RequestError extends Error {
  readonly code: ApiErrorCode
  readonly fields: Record<string, string>

  constructor(message: string, code: ApiErrorCode, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'RequestError'
    this.code = code
    this.fields = fields
  }
}

const isApiError = (value: unknown): value is ApiError =>
  typeof value === 'object' && value !== null && typeof (value as ApiError).error === 'string'

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      // The session lives in an HttpOnly cookie; nothing identifies the user
      // from client-side state any more.
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new RequestError('you appear to be offline — check your connection', 'internal_error')
  }

  if (res.status === 204) return undefined as T

  // Parse only after the status is known: a non-JSON error response must not
  // surface as a raw SyntaxError.
  const text = await res.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!res.ok) {
    if (isApiError(payload)) {
      throw new RequestError(payload.error, payload.code ?? 'internal_error', payload.fields ?? {})
    }
    throw new RequestError(`request failed (${res.status})`, 'internal_error')
  }
  return payload as T
}

export const register = (input: {
  username: string
  password: string
  email?: string
  displayName?: string
}) => request<SessionResponse>('/auth/register', { method: 'POST', body: JSON.stringify(input) })

export const login = (input: { username: string; password: string }) =>
  request<SessionResponse>('/auth/login', { method: 'POST', body: JSON.stringify(input) })

export const logout = () => request<void>('/auth/logout', { method: 'POST' })

export const me = () => request<AuthenticatedUser>('/auth/me')

export const requestPasswordReset = (username: string) =>
  request<void>('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ username }),
  })

export const confirmPasswordReset = (token: string, password: string) =>
  request<void>('/auth/password-reset/confirm', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })

export const verifyEmail = (token: string) =>
  request<AuthenticatedUser>('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })

export const listPosts = (author?: string) =>
  request<Post[]>(author ? `/posts?author=${encodeURIComponent(author)}` : '/posts')

export const getThread = (id: string) => request<Thread>(`/posts/${encodeURIComponent(id)}`)

export const createPost = (body: string, parentId?: string) =>
  request<Post>('/posts', {
    method: 'POST',
    body: JSON.stringify({ body, parentId: parentId ?? null }),
  })

export const deletePost = (id: string) =>
  request<void>(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE' })

export const toggleLike = (id: string) =>
  request<LikeResult>(`/posts/${encodeURIComponent(id)}/like`, { method: 'POST' })
