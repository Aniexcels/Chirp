# Chirp

A small social app: post short messages, reply in threads, like posts, browse a single author's feed.

- **Frontend** — React 19 + TypeScript, bundled by Vite into `dist/client`
- **API** — Hono running on Cloudflare Workers (`worker/index.ts`)
- **Storage** — Cloudflare D1 (SQLite), schema in `migrations/`
- **Types** — request/response shapes shared by both sides in `shared/types.ts`

Identity is deliberately trivial: you pick a handle, it's kept in `localStorage` and sent as an
`x-chirp-user` header. There are no passwords — anyone can claim any handle. Add real auth
(e.g. Cloudflare Access, or signed cookies) before putting this anywhere public.

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
| `GET` | `/api/posts` | 50 most recent top-level posts (`?author=` to filter) |
| `GET` | `/api/posts/:id` | A post plus its replies |
| `POST` | `/api/posts` | Create a post or reply (`{ body, parentId? }`) |
| `DELETE` | `/api/posts/:id` | Delete your own post |
| `POST` | `/api/posts/:id/like` | Toggle a like, returns the new count |

All routes read the caller's handle from the `x-chirp-user` header; writes return 401 without a
valid one.

## Checks

```bash
npm run lint
npm run build   # runs tsc -b across the app, worker and node configs
```
