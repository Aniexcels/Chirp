import type { AccountStatus, AuthenticatedUser, PublicUser } from '../shared/types'
import type { Env } from './env'

export interface UserRow {
  id: string
  username: string
  display_name: string
  email: string | null
  password_hash: string | null
  avatar_url: string | null
  bio: string
  status: string
  email_verified_at: number | null
  created_at: number
  updated_at: number
}

export const USER_COLUMNS =
  'id, username, display_name, email, password_hash, avatar_url, bio, status, email_verified_at, created_at, updated_at'

export const toPublicUser = (row: UserRow): PublicUser => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  bio: row.bio,
  avatarUrl: row.avatar_url,
  createdAt: row.created_at,
})

/** Password hashes and reset state never cross this boundary. */
export const toAuthenticatedUser = (row: UserRow): AuthenticatedUser => ({
  ...toPublicUser(row),
  email: row.email,
  emailVerified: row.email_verified_at !== null,
  status: row.status as AccountStatus,
})

export const findUserByUsername = (env: Env, username: string): Promise<UserRow | null> =>
  env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?1`)
    .bind(username)
    .first<UserRow>()

export const findUserById = (env: Env, id: string): Promise<UserRow | null> =>
  env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?1`).bind(id).first<UserRow>()

/**
 * A legacy account is one created by the pre-authentication header identity:
 * it owns posts but has no credentials, so registration may claim its handle.
 */
export const isClaimableLegacyAccount = (row: UserRow): boolean =>
  row.password_hash === null && row.email === null
