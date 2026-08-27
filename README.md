# Chirp

A small social app: post short messages, reply in threads, like posts, browse a single author's feed.

- **Frontend** — React 19 + TypeScript, bundled by Vite into `dist/client`
- **API** — Hono running on Cloudflare Workers (`worker/index.ts`)
- **Storage** — Cloudflare D1 (SQLite), schema in `migrations/`
- **Types** — request/response shapes shared by both sides in `shared/types.ts`

## Authentication

Identity is established server-side only. Nothing a client asserts about who it is, is trusted.

- Passwords are hashed with PBKDF2-SHA256 (210k iterations) via WebCrypto — no native dependency.
- A session token is returned once and stored only as a hash. Browsers get it in an HttpOnly,
  `SameSite=Lax` cookie; native clients may send it as `Authorization: Bearer <token>`.
- Sessions expire after 30 days, slide forward while in use, and are revoked on logout and on
  every password reset.
- Password reset and email verification links carry single-use, expiring tokens. There is no mail
  provider bound yet, so `worker/mailer.ts` logs the link (visible in `wrangler tail`) instead of
  sending it; wiring a provider means implementing `send` there and nothing else.
- Handles created before authentication existed (no password, no email) can be claimed by
  registering them, which keeps their posts and likes attached to the new account.
- Auth endpoints, posting and liking are rate limited per IP and per account.
- Accounts carry a status (`active`, `suspended`, `deactivated`); anything but `active` cannot use
  the API even with a valid session token.

## Brand assets

`brand/chirp-logo.png` is the full logo lockup and the source of truth. The assets the app actually
ships are cropped from the bird mark in it, with the white background keyed out to alpha:

| Asset | Use |
| --- | --- |
| `src/assets/chirp-mark.png` | 256px mark, rendered in the header and on the sign-in screen |
| `public/favicon.png` | 32px browser tab icon |
| `public/apple-touch-icon.png` | 180px iOS home-screen icon, flattened onto white |

Regenerate them from `brand/chirp-logo.png` if the logo changes; do not edit them by hand.

## Local development

```bash
npm install
npm run db:migrate:local     # create the local D1 database
npm run build                # wrangler serves ./dist/client as static assets
npm run dev:worker           # http://localhost:8787 — full app, real D1
```

For frontend iteration with hot reload, run `npm run dev:worker` in one terminal and
`npm run dev` in another: Vite serves the UI on :5173 and proxies `/api` to the worker on :8787.

## Deploying to Cloudflare Workers

```bash
npx wrangler login
npx wrangler d1 create chirp-db     # copy the printed database_id into wrangler.jsonc
npm run db:migrate                  # apply migrations to the remote database
npm run deploy                      # builds the client, then wrangler deploy
```

`wrangler.jsonc` ships with a placeholder `database_id`; deployment fails until you replace it
with the id of your own D1 database. The Worker serves the built client as static assets and
handles `/api/*` itself, so a single `wrangler deploy` ships the whole app.

## API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account (`{ username, password, email?, displayName? }`) |
| `POST` | `/api/auth/login` | Start a session (`{ username, password }`) |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/auth/me` | The signed-in user |
| `POST` | `/api/auth/password-reset/request` | Email a reset link; always 202 |
| `POST` | `/api/auth/password-reset/confirm` | Set a new password (`{ token, password }`) |
| `POST` | `/api/auth/verify-email` | Confirm an address (`{ token }`) |
| `GET` | `/api/posts` | 50 most recent top-level posts (`?author=` to filter) |
| `GET` | `/api/posts/:id` | A post plus its replies |
| `POST` | `/api/posts` | Create a post or reply (`{ body, parentId? }`) |
| `DELETE` | `/api/posts/:id` | Delete your own post |
| `POST` | `/api/posts/:id/like` | Toggle a like, returns the new count |

Reads are public; every write requires a session. Errors are always JSON of the shape
`{ code, error, fields?, retryAfter? }` — see `ApiErrorCode` in `shared/types.ts`.

## Data model

`migrations/0001_init.sql` keyed users, posts and likes by handle. `0002_identity.sql` repoints
everything at an opaque `users.id`, preserving existing rows (handles, posts, likes and their
timestamps), and adds `sessions`, `auth_tokens` and `rate_limits`. Handles are now a unique column
rather than a primary key, so they can change later without touching foreign keys.

## Checks

```bash
npm run lint
npm run typecheck
npm test        # API tests in workerd against a real local D1 built from migrations/
npm run build
```

The same four commands run in CI (`.github/workflows/ci.yml`) on every pull request.
