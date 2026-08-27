import type { ApiError, ApiErrorCode } from '../shared/types'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

const STATUS: Record<ApiErrorCode, ContentfulStatusCode> = {
  validation_error: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
}

/**
 * Thrown anywhere in a handler; the app-level error handler turns it into the
 * `ApiError` envelope. Nothing else may reach the client, so unexpected
 * failures stay a generic 500 with no internals.
 */
export class HttpError extends Error {
  readonly code: ApiErrorCode
  readonly fields?: Record<string, string>
  readonly retryAfter?: number

  constructor(
    code: ApiErrorCode,
    message: string,
    options: { fields?: Record<string, string>; retryAfter?: number } = {},
  ) {
    super(message)
    this.name = 'HttpError'
    this.code = code
    this.fields = options.fields
    this.retryAfter = options.retryAfter
  }

  get status(): ContentfulStatusCode {
    return STATUS[this.code]
  }

  toJSON(): ApiError {
    return {
      code: this.code,
      error: this.message,
      ...(this.fields ? { fields: this.fields } : {}),
      ...(this.retryAfter ? { retryAfter: this.retryAfter } : {}),
    }
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new HttpError('validation_error', message, { fields })

export const unauthenticated = (message = 'sign in to continue') =>
  new HttpError('unauthenticated', message)

export const forbidden = (message = 'you are not allowed to do that') =>
  new HttpError('forbidden', message)

export const notFound = (message = 'not found') => new HttpError('not_found', message)

export const conflict = (message: string, fields?: Record<string, string>) =>
  new HttpError('conflict', message, { fields })

export const rateLimited = (retryAfter: number) =>
  new HttpError('rate_limited', 'too many attempts, try again shortly', { retryAfter })
