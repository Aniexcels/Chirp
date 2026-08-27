---
name: testing-chirp
description: How to run and browser-test the Chirp app (React + Vite client, Hono worker, local D1) end to end.
---

# Testing Chirp locally

## Run the full app (client + API on one origin)
```bash
cd <repo>
npm install                      # only if node_modules missing
npm run db:migrate:local         # applies migrations/ to local D1 (idempotent)
npm run build                    # tsc -b && vite build -> dist/client
npx wrangler dev                 # serves built client + /api at http://localhost:8787
```
- The worker serves the **built** client from `dist/client`, so re-run `npm run build` after any
  client change; a stale `dist/` will silently make you test old code.
- `npm run dev` (Vite on :5173, proxies /api to :8787) is only useful for hot reload; prefer :8787
  for E2E testing so there is a single origin.
- If a previous `wrangler dev` is already bound to 8787, `pkill -f wrangler` first. Note that
  `pkill -f wrangler` run in the same shell as other chained commands can kill the shell itself —
  run it as its own command.

## Auth (no secrets needed)
- Handle-based: type a handle (3–20 chars, `[a-z0-9_]`) on the login screen. It is stored in
  `localStorage["chirp:user"]` and sent as the `x-chirp-user` header on every request.
- To simulate a second user, click "sign out" in the header and enter another handle. Both browser
  tabs share localStorage, so two tabs are always the same user — useful for testing stale-state
  errors (delete a post in tab B, then act on it in tab A to get an error banner).

## UI map (src/App.tsx, src/components/)
- Feed: composer at top, cards below, newest first. Card click → thread view; `@author` click →
  author-filtered feed ("back to feed" link returns).
- Card footer: `♡/♥ <likeCount>` toggle button, `💬 <replyCount>` (static), `Delete` rendered only
  when `post.author === currentUser`.
- Composer: counter = 280 - length, gets class `over` (red) when negative; submit disabled when
  empty/over/busy; Ctrl+Enter (or Cmd+Enter) submits.
- Errors from the API are rendered as a red `.error` paragraph directly below the header.

## Devin secrets needed
None.
