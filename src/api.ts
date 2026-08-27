import type { ApiError, Post } from '../shared/types'

const USER_HEADER = 'x-chirp-user'

const request = async <T>(path: string, user: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      [USER_HEADER]: user,
      ...init?.headers,
    },
  })
  if (res.status === 204) return undefined as T
  const data = await res.json()
  if (!res.ok) throw new Error((data as ApiError).error ?? 'request failed')
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
