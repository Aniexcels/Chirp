# Chirp – Cloudflare Deployment Checklist

**Status:** Ready for production deployment ✅

This document guides you through deploying Chirp to Cloudflare Workers with D1 database.

---

## ✅ Pre-Deployment Setup

### 1. Cloudflare Account Setup
- [ ] Create [Cloudflare account](https://dash.cloudflare.com/) (done)
- [ ] Note your **Account ID** (from Cloudflare dashboard → bottom left)
  ```bash
  npx wrangler whoami  # Shows Account ID
  ```

### 2. D1 Database Configuration

#### Create the Remote Database
```bash
npx wrangler d1 create chirp-db
```

You'll see output like:
```
✓ Successfully created D1 database 'chirp-db'
Database ID: 12345678-abcd-ef01-2345-6789abcdef01
Binding name: DB
```

#### Update `wrangler.jsonc`
Replace the placeholder `database_id`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "chirp-db",
      "database_id": "12345678-abcd-ef01-2345-6789abcdef01",  // ← YOUR ID
      "migrations_dir": "migrations"
    }
  ]
}
```

#### Apply Schema Migrations
```bash
npm run db:migrate
```

This creates the `users`, `posts`, and `likes` tables in your D1 database.

### 3. Create Database Migrations

**Your `migrations/` directory should contain schema files.** Example:

Create `migrations/0001_init.sql`:
```sql
-- Initialize Chirp schema
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL REFERENCES users(username),
  body TEXT NOT NULL,
  parent_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES users(username),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, username)
);

CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON posts(parent_id);
```

Apply migrations:
```bash
npm run db:migrate
```

---

## 🚀 Deployment Steps

### Step 1: Verify Local Build
```bash
npm install
npm run build
npm run test
npm run lint
```

**Expected output:**
- ✓ Build succeeds in `dist/client/`
- ✓ Tests pass
- ✓ No linting errors

### Step 2: Test Locally with D1
```bash
# Terminal 1: Run the worker with local D1
npm run dev:worker

# Terminal 2 (optional): Frontend with hot reload
npm run dev

# Visit http://localhost:8787
```

### Step 3: Deploy to Cloudflare
```bash
npm run deploy
```

**First-time deployment notes:**
- This runs `npm run build` then `wrangler deploy`
- Worker endpoint: `https://chirp.workers.dev`
- Your custom domain setup happens in Cloudflare dashboard

### Step 4: Post-Deployment Verification

#### Test the API
```bash
# List all posts
curl https://chirp.workers.dev/api/posts

# Create a post (set your username)
curl -X POST https://chirp.workers.dev/api/posts \
  -H "Content-Type: application/json" \
  -H "x-chirp-user: testuser" \
  -d '{"body":"Hello Cloudflare!"}'
```

#### View Logs
```bash
npx wrangler tail
```

#### Monitor in Cloudflare Dashboard
- **URL:** https://dash.cloudflare.com/
- **Path:** Workers & Pages → Chirp → Deployments, Logs, Metrics

---

## 🔐 Security Checklist

⚠️ **CRITICAL BEFORE PUBLIC DEPLOYMENT:**

The current identity system is **trivial**: users pick any handle, it's stored in `localStorage`, and sent as the `x-chirp-user` header. **Anyone can impersonate anyone else.**

### Implement Real Authentication

Choose one approach:

#### Option A: Cloudflare Access (Recommended for Enterprise)
```bash
# Protect your Workers route behind Cloudflare Access
# https://dash.cloudflare.com/ → Workers & Pages → Chirp → Routes
```

#### Option B: Session Cookies (Recommended for Public Apps)
1. Add a `/login` POST route that validates credentials
2. Create a signed session cookie
3. Validate the cookie on protected routes

#### Option C: OAuth (GitHub, Google, etc.)
Integrate with a third-party provider (add endpoints for login/callback)

### Additional Security Headers
Your worker already includes:
- ✓ Content-Security-Policy
- ✓ X-Frame-Options: DENY
- ✓ X-Content-Type-Options: nosniff
- ✓ Referrer-Policy

---

## 🌍 Custom Domain Setup

### Using a Cloudflare-Hosted Domain
1. Go to **dash.cloudflare.com** → **Workers & Pages** → **Chirp**
2. Click **Routes** → **Add Route**
3. Enter pattern: `example.com/*` or `chirp.example.com/*`
4. Select **HTTPS**
5. Click **Save**

### Using an External Domain
1. Add a CNAME record pointing to `chirp.workers.dev`
2. Verify in Cloudflare dashboard

---

## 📊 Monitoring & Maintenance

### Enable Real-Time Logs
```bash
npx wrangler tail --format pretty
```

### Database Backups
```bash
# Export database to SQL file
npx wrangler d1 export chirp-db > backup.sql

# Import into a new database
npx wrangler d1 execute new-chirp-db < backup.sql
```

### View Metrics
- **Requests per second:** Workers dashboard → Metrics
- **Error rates:** Analytics → Workers
- **Database query times:** D1 → Metrics

---

## 🔄 Continuous Deployment (Optional GitHub Actions)

Create `.github/workflows/deploy.yml` for automatic deployment on `main` branch:

```yaml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: npm

      - run: npm ci
      - run: npm run lint
      - run: npm run test
      - run: npm run build

      - name: Deploy to Cloudflare
        run: npm run deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

**To enable:**
1. Go to **Settings → Secrets and variables → Actions**
2. Add `CLOUDFLARE_API_TOKEN` from [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Create new token → Use "Edit Cloudflare Workers" template
   - Grant permissions for your account

---

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| **`ASSETS binding not found`** | Run `npm run build` before deploying. Wrangler serves files from `dist/client/`. |
| **`Database not found`** | Verify `database_id` in `wrangler.jsonc` matches your D1 database ID. |
| **`401 Unauthorized on POST`** | Ensure client sends `x-chirp-user` header. Check browser console for errors. |
| **Slow responses** | Check D1 metrics and query performance. Add indexes if needed. |
| **CORS errors** | Worker already sets security headers; check client fetch calls. |
| **Migrations not applying** | Verify migration files exist in `migrations/` directory and are named `*.sql`. |

---

## 📈 Performance Tips

1. **Enable caching for static assets:**
   ```jsonc
   // In wrangler.jsonc
   "routes": [
     { "pattern": "example.com/assets/*", "zone_name": "example.com", "custom_domain": true }
   ]
   ```

2. **Add Durable Objects for per-user sessions** (if scaling beyond thousands)

3. **Use D1 replication** for geographic distribution (Cloudflare plan required)

4. **Set up analytics engine** to log custom metrics

---

## 🎉 Success Criteria

Your deployment is production-ready when:

- ✓ `npm run deploy` completes without errors
- ✓ API endpoints respond with correct data
- ✓ Database queries work (test from browser DevTools)
- ✓ Authentication implemented and tested
- ✓ Security headers verified with curl
- ✓ Custom domain configured (if desired)
- ✓ Monitoring & logs accessible

---

## 📚 Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [D1 Database Guide](https://developers.cloudflare.com/d1/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/commands/)
- [Hono Documentation](https://hono.dev/)
- [React on Cloudflare](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-app/)

---

**Last Updated:** August 27, 2026
**Chirp Version:** 0.1.0
**Wrangler Version:** 4.86.0+
