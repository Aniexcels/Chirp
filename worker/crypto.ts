/**
 * Password hashing and token derivation using only WebCrypto, which the
 * Workers runtime provides natively — no native-module dependency that would
 * not run on the edge.
 *
 * Hashes are stored as `pbkdf2$<iterations>$<salt>$<hash>` (base64url), so the
 * iteration count can be raised later and old hashes still verify.
 */

const ALGORITHM = 'pbkdf2'
const ITERATIONS = 210_000
const KEY_LENGTH = 32
const SALT_LENGTH = 16

const encoder = new TextEncoder()

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

const fromBase64Url = (value: string): Uint8Array => {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

const derive = async (password: string, salt: Uint8Array, iterations: number) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    KEY_LENGTH * 8,
  )
  return new Uint8Array(bits)
}

export const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const hash = await derive(password, salt, ITERATIONS)
  return `${ALGORITHM}$${ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`
}

/** Constant-time comparison so verification cannot leak the hash byte by byte. */
const equal = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [algorithm, iterations, salt, hash] = stored.split('$')
  if (algorithm !== ALGORITHM || !iterations || !salt || !hash) return false
  const rounds = Number(iterations)
  if (!Number.isInteger(rounds) || rounds <= 0) return false
  const candidate = await derive(password, fromBase64Url(salt), rounds)
  return equal(candidate, fromBase64Url(hash))
}

/** A 256-bit opaque token, safe to put in a cookie or an email link. */
export const generateToken = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)))

/** Tokens are only ever stored hashed, so a database leak cannot be replayed. */
export const hashToken = async (token: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return toBase64Url(new Uint8Array(digest))
}
