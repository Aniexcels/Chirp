# Quick Deployment Guide

This guide walks you through deploying Chirp to Cloudflare in 5 minutes.

## Prerequisites

- ✅ Node.js 20+ installed
- ✅ Cloudflare account created
- ✅ Git repository cloned locally

## 5-Minute Deployment

### 1. Authenticate with Cloudflare (1 min)

```bash
npx wrangler login
```

This opens your browser to authorize Wrangler CLI.

### 2. Create D1 Database (1 min)

```bash
npx wrangler d1 create chirp-db
```

**Copy the output:** You'll see something like:
```
Database ID: 12345678-abcd-ef01-2345-6789abcdef01
```

### 3. Update wrangler.jsonc (1 min)

Open `wrangler.jsonc` and replace the placeholder:

```diff
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "chirp-db",
-     "database_id": "00000000-0000-0000-0000-000000000000",
+     "database_id": "12345678-abcd-ef01-2345-6789abcdef01",
      "migrations_dir": "migrations"
    }
  ]
```

### 4. Deploy (2 min)

```bash
# Apply database schema
npm run db:migrate

# Build and deploy
npm run deploy
```

**Done!** 🎉

Your app is now live at: `https://chirp.workers.dev`

## Verify Deployment

```bash
# Test the API
curl https://chirp.workers.dev/api/posts

# Create a test post
curl -X POST https://chirp.workers.dev/api/posts \
  -H "Content-Type: application/json" \
  -H "x-chirp-user: alice" \
  -d '{"body":"Hello Cloudflare!"}'

# View logs in real-time
npx wrangler tail
```

## Automated Deployment (GitHub Actions)

To enable auto-deployment on every push to `main`:

1. **Go to:** `Settings → Secrets and variables → Actions`
2. **Create secret:** `CLOUDFLARE_API_TOKEN`
   - Get token: https://dash.cloudflare.com/profile/api-tokens
   - Select: "Edit Cloudflare Workers" template
   - Copy & paste into GitHub

**That's it!** Next push to `main` → Auto-deploys

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ASSETS binding not found` | Run `npm run build` first |
| `Database not found` | Update `database_id` in `wrangler.jsonc` |
| `401 Unauthorized` | Send `x-chirp-user` header in requests |
| `Deployment timeout` | Check: `npx wrangler tail` |

## Next Steps

- 📖 Read: `CLOUDFLARE_DEPLOYMENT.md` (comprehensive guide)
- 🔐 Implement real auth (see deployment guide)
- 🌍 Set custom domain in Cloudflare Dashboard
- 📊 Monitor: https://dash.cloudflare.com/

**Need help?** See full guide in `CLOUDFLARE_DEPLOYMENT.md`
