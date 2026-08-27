import type { ApiError, Post } from '../shared/types'

const USER_HEADER = 'x-chirp-user'

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

const errorMessage = (data: unknown, status: number): string => {
  const error = (data as ApiError | undefined)?.error
  return typeof error === 'string' && error ? error : `request failed (${status})`
}

const request = async <T>(path: string, user: string, init?: RequestInit): Promise<T> => {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        [USER_HEADER]: user,
        ...init?.headers,
      },
    })
  } catch (e) {
    console.error(`request to /api${path} failed`, e)
    throw new Error('could not reach the server — check your connection')
  }

  const text = await res.text()
  const data = text ? parseJson(text) : undefined

  if (!res.ok) throw new Error(errorMessage(data, res.status))
  if (data === undefined) {
    if (res.status === 204 || !text) return undefined as T
    console.error(`unparseable response from /api${path}`, text)
    throw new Error('the server sent an unexpected response')
  }
  return data as T
}

export const listPosts = (user: string, author?: string) =>
  request<Post[]>(author ? `/posts?author=${encodeURIComponent(author)}` : '/posts', user)

export const getThread = (user: string, id: string) =>
  request<{ post: Post; replies: Post[] }>(`/posts/${id}`, user)

export const createPost = (user: string, body: string, parentId?: string) =>
  request<Post>('/posts', user, {
    method: 'POST',
    body: JSON.stringify({ body, parentId: parentId ?? null }),
  })

export const deletePost = (user: string, id: string) =>
  request<void>(`/posts/${id}`, user, { method: 'DELETE' })

export const toggleLike = (user: string, id: string) =>
  request<{ likeCount: number; likedByMe: boolean }>(`/posts/${id}/like`, user, { method: 'POST' })
