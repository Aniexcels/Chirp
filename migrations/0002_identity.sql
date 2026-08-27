-- Phase B: real identity.
--
-- Moves every relationship off the mutable `username` and onto an opaque
-- `users.id`, and adds the tables authentication needs. Existing rows are
-- copied, never dropped: each legacy handle becomes a user record with no
-- credentials (password_hash IS NULL), which registration can claim by
-- handle so pre-auth posts and likes keep their author.

PRAGMA defer_foreign_keys = true;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT,
  password_hash TEXT,
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated')),
  email_verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO users_new (id, username, display_name, created_at, updated_at)
SELECT lower(hex(randomblob(16))), username, username, created_at, created_at FROM users;

CREATE TABLE posts_new (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES users_new(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  parent_id TEXT REFERENCES posts_new(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO posts_new (id, author_id, body, parent_id, created_at, updated_at)
SELECT p.id, u.id, p.body, p.parent_id, p.created_at, p.created_at
FROM posts p JOIN users_new u ON u.username = p.author;

CREATE TABLE likes_new (
  post_id TEXT NOT NULL REFERENCES posts_new(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users_new(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

INSERT INTO likes_new (post_id, user_id, created_at)
SELECT l.post_id, u.id, l.created_at
FROM likes l JOIN users_new u ON u.username = l.username;

DROP TABLE likes;
DROP TABLE posts;
DROP TABLE users;

ALTER TABLE users_new RENAME TO users;
ALTER TABLE posts_new RENAME TO posts;
ALTER TABLE likes_new RENAME TO likes;

CREATE UNIQUE INDEX idx_users_email ON users (email) WHERE email IS NOT NULL;
CREATE INDEX idx_posts_author_created ON posts (author_id, created_at DESC);
CREATE INDEX idx_posts_root_created ON posts (created_at DESC) WHERE parent_id IS NULL;
CREATE INDEX idx_posts_parent_created ON posts (parent_id, created_at);
CREATE INDEX idx_likes_user ON likes (user_id);

-- Opaque session tokens are never stored: `id` is the SHA-256 of the token.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  user_agent TEXT
);

CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- Single-use, hashed tokens for password reset and email verification.
CREATE TABLE auth_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('password_reset', 'email_verification')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX idx_auth_tokens_user_kind ON auth_tokens (user_id, kind);

-- Fixed-window counters for abuse protection on sensitive routes.
CREATE TABLE rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
