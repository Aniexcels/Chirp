import {
  EMAIL_PATTERN,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_POST_LENGTH,
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
} from '../shared/types'
import type {
  LoginBody,
  PasswordResetBody,
  PasswordResetRequestBody,
  RegisterBody,
  VerifyEmailBody,
} from '../shared/types'
import { badRequest } from './errors'

type Json = Record<string, unknown>

/**
 * Every request body is validated here before a handler touches it — malformed
 * JSON and wrong types become a 400 envelope instead of an unhandled throw.
 */
export const asObject = (value: unknown): Json => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw badRequest('request body must be a JSON object')
  }
  return value as Json
}

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw badRequest(`${field} is required`, { [field]: 'required' })
  return value
}

const optionalString = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === '') return null
  return requireString(value, field)
}

export const normalizeUsername = (value: unknown, field = 'username'): string => {
  const username = requireString(value, field).trim().toLowerCase()
  if (!USERNAME_PATTERN.test(username)) {
    throw badRequest('handle must be 3–20 characters: a–z, 0–9, underscore', {
      [field]: 'invalid',
    })
  }
  return username
}

const parsePassword = (value: unknown): string => {
  const password = requireString(value, 'password')
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`password must be at least ${MIN_PASSWORD_LENGTH} characters`, {
      password: 'too_short',
    })
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw badRequest(`password must be ${MAX_PASSWORD_LENGTH} characters or fewer`, {
      password: 'too_long',
    })
  }
  return password
}

const parseEmail = (value: unknown): string | null => {
  const email = optionalString(value, 'email')?.trim().toLowerCase() ?? null
  if (email === null) return null
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw badRequest('enter a valid email address', { email: 'invalid' })
  }
  return email
}

const parseDisplayName = (value: unknown, fallback: string): string => {
  const name = optionalString(value, 'displayName')?.trim() ?? ''
  if (!name) return fallback
  if (name.length > MAX_DISPLAY_NAME_LENGTH) {
    throw badRequest(`display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer`, {
      displayName: 'too_long',
    })
  }
  return name
}

export const parseRegisterBody = (raw: unknown): Required<RegisterBody> => {
  const body = asObject(raw)
  const username = normalizeUsername(body.username)
  return {
    username,
    password: parsePassword(body.password),
    email: parseEmail(body.email),
    displayName: parseDisplayName(body.displayName, username),
  }
}

export const parseLoginBody = (raw: unknown): LoginBody => {
  const body = asObject(raw)
  return {
    username: normalizeUsername(body.username),
    // Deliberately unvalidated beyond being a string: length rules must not
    // let an attacker distinguish "wrong shape" from "wrong password".
    password: requireString(body.password, 'password'),
  }
}

export const parsePasswordResetRequestBody = (raw: unknown): PasswordResetRequestBody => ({
  username: normalizeUsername(asObject(raw).username),
})

const parseToken = (value: unknown): string => {
  const token = requireString(value, 'token').trim()
  if (!token || token.length > 200) throw badRequest('invalid or expired token', { token: 'invalid' })
  return token
}

export const parsePasswordResetBody = (raw: unknown): PasswordResetBody => {
  const body = asObject(raw)
  return { token: parseToken(body.token), password: parsePassword(body.password) }
}

export const parseVerifyEmailBody = (raw: unknown): VerifyEmailBody => ({
  token: parseToken(asObject(raw).token),
})

export const parseCreatePostBody = (raw: unknown): { body: string; parentId: string | null } => {
  const input = asObject(raw)
  const text = requireString(input.body, 'body').trim()
  if (!text) throw badRequest('post cannot be empty', { body: 'required' })
  if (text.length > MAX_POST_LENGTH) {
    throw badRequest(`post must be ${MAX_POST_LENGTH} characters or fewer`, { body: 'too_long' })
  }
  const parentId = optionalString(input.parentId, 'parentId')
  return { body: text, parentId }
}
