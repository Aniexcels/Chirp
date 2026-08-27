import type { Env } from './env'

/**
 * Delivery boundary for transactional email. There is no mail provider bound
 * yet, so links are logged (visible in `wrangler tail`) instead of sent; the
 * token flows themselves are real. Wiring a provider means implementing `send`
 * here only — no route or token logic changes.
 */
export interface OutboundEmail {
  to: string
  subject: string
  body: string
}

export const send = async (email: OutboundEmail): Promise<void> => {
  console.info(JSON.stringify({ event: 'email.pending_delivery', ...email }))
  await Promise.resolve()
}

const origin = (env: Env, request: Request): string =>
  env.APP_ORIGIN?.replace(/\/$/, '') ?? new URL(request.url).origin

export const sendPasswordResetEmail = (
  env: Env,
  request: Request,
  to: string,
  token: string,
): Promise<void> =>
  send({
    to,
    subject: 'Reset your Chirp password',
    body: `Open ${origin(env, request)}/reset-password?token=${encodeURIComponent(token)} to choose a new password. The link expires in 1 hour.`,
  })

export const sendEmailVerificationEmail = (
  env: Env,
  request: Request,
  to: string,
  token: string,
): Promise<void> =>
  send({
    to,
    subject: 'Confirm your Chirp email',
    body: `Open ${origin(env, request)}/verify-email?token=${encodeURIComponent(token)} to confirm this address. The link expires in 24 hours.`,
  })
