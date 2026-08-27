export interface Post {
  id: string
  author: string
  body: string
  createdAt: number
  likeCount: number
  likedByMe: boolean
  replyCount: number
  parentId: string | null
}

export interface CreatePostBody {
  body: string
  parentId?: string | null
}

export interface ApiError {
  error: string
}

export const MAX_POST_LENGTH = 280
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/
