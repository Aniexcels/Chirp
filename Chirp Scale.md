You are taking over an existing application called Chirp. Your task is to evolve it from a small prototype into a premium, scalable, production-ready social media platform.

IMPORTANT: Do not rebuild the application from scratch. Inspect the existing codebase first and evolve it safely. Preserve working functionality wherever reasonably possible.

# CURRENT APPLICATION

Chirp is currently built with:

- Frontend: React 19 + TypeScript
- Build tool: Vite
- Backend/API: Hono
- Runtime: Cloudflare Workers
- Database: Cloudflare D1 using SQLite
- Shared API types: shared/types.ts
- Database migrations: migrations/
- Worker entry point: worker/index.ts

The current application supports:

- Creating short text posts
- Replying in threads
- Liking posts
- Browsing a single author's feed
- Deleting your own posts

Current API routes include:

- GET /api/posts
- GET /api/posts/:id
- POST /api/posts
- DELETE /api/posts/:id
- POST /api/posts/:id/like

The current identity system is NOT production-ready.

Users currently choose a handle stored in localStorage and sent using the x-chirp-user header. Anyone can impersonate another user by sending a different handle.

This must be replaced before the application is considered public or production-ready.

# ABSOLUTE DEVELOPMENT RULES

Before changing code:

1. Inspect the entire repository and understand the current architecture.
2. Read package.json and identify all existing dependencies and scripts.
3. Inspect worker/index.ts and all API routes.
4. Inspect all database migrations and current schema.
5. Inspect shared/types.ts and all shared contracts.
6. Inspect the React component structure and current state management.
7. Identify existing Cloudflare bindings and wrangler configuration.
8. Identify incomplete features, technical debt, security risks, and scalability limitations.

Then provide a brief architecture audit containing:

- What currently exists
- What is already working
- Current database structure
- Current API architecture
- Current authentication and authorization risks
- Major scalability limitations
- Major security risks
- Recommended architecture for the next stage

Do not start a large rewrite before completing this inspection.

After the audit, implement the upgrade in controlled phases.

Do not remove working functionality unnecessarily.

Do not change the existing React + Vite + Hono + Cloudflare Workers architecture unless there is a compelling technical reason.

Do not introduce unnecessary dependencies.

Do not create fake buttons, placeholder functionality, or UI-only features that do not actually work.

Every feature added must be connected properly to the database, API, authorization layer, and frontend where applicable.

==================================================
PHASE 1: PRODUCTION FOUNDATION AND REAL IDENTITY
==================================================

This is the highest priority phase.

Replace the insecure x-chirp-user identity system with real authentication.

Evaluate the most appropriate authentication architecture for the existing Cloudflare Workers + Hono + React application.

The authentication system must support:

- User registration
- Secure login
- Secure logout
- Authenticated sessions
- Persistent login where appropriate
- Password hashing
- Secure password reset architecture
- Email verification architecture
- Protected routes
- Authentication rate limiting
- Account status management
- Future OAuth/social login support

Do not trust a username sent directly by the browser.

The authenticated user identity must be established securely server-side.

Prefer an architecture compatible with Cloudflare Workers and future native mobile clients.

Create proper user records containing, where appropriate:

- Stable user ID
- Unique username
- Display name
- Email
- Password hash or authentication provider reference
- Profile image reference
- Bio
- Account status
- Email verification status
- Created timestamp
- Updated timestamp

Do not expose password hashes or sensitive authentication data through API responses.

Implement proper authorization.

For every write operation, verify server-side that the authenticated user is allowed to perform the action.

A user must not be able to:

- Delete another user's post
- Edit another user's profile
- Access private data through manipulated IDs
- Impersonate another user
- Manipulate likes or relationships through forged user identifiers

Preserve existing post, reply, like, and deletion functionality while migrating it to the new identity model.

Create safe database migrations.

Do not destructively reset existing data.

If legacy data requires migration, provide a clear migration strategy.

==================================================
PHASE 2: DATABASE AND DOMAIN ARCHITECTURE
==================================================

Review the current D1 schema and evolve it for a real social platform.

Create a clean domain model for at least:

- Users
- Profiles
- Posts
- Post media
- Replies
- Likes or reactions
- Follows
- Notifications
- Reports
- Blocks
- Bookmarks
- Sessions or authentication records where appropriate

Do not put unrelated features into one oversized table.

Add proper indexes for common queries.

Pay particular attention to indexes for:

- Post author
- Post creation time
- Parent post
- Likes
- Follows
- Notifications
- Username lookup

Use database constraints where appropriate.

Use migrations for every schema change.

Prepare the architecture so future features can be added without major schema rewrites.

Do not add tables for speculative features unless there is a clear architectural reason.

==================================================
PHASE 3: PREMIUM USER PROFILES AND SOCIAL GRAPH
==================================================

Build a complete profile system.

Profiles should support:

- Unique username
- Display name
- Profile photo
- Optional cover image
- Bio
- Optional website
- Join date
- Follower count
- Following count
- Post count

Implement:

- Follow user
- Unfollow user
- Remove follower where appropriate
- Block user
- Unblock user
- Mute user architecture if appropriate

Build the social graph as a dedicated relationship system.

Do not store follower lists as arrays or JSON blobs inside the users table.

Ensure duplicate follow relationships cannot occur.

Create proper indexes for follower and following queries.

The profile experience should feel premium, polished, and fast.

==================================================
PHASE 4: POSTS AND CONTENT EXPERIENCE
==================================================

Upgrade the post system while preserving the existing short-post experience.

Support:

- Text posts
- Replies
- Threaded conversations
- Post editing
- Post deletion
- Character limits configured centrally
- Mentions
- Hashtags
- Bookmarks
- Link detection and previews where feasible

Do not implement a giant collection of content types all at once.

Build a flexible architecture that can later support images, videos, polls, and other content.

Add proper post visibility and moderation status architecture.

Use soft deletion where appropriate so moderation and audit requirements can be supported.

Create stable post identifiers and clean permalink routing.

Ensure replies and threads are efficiently queried.

Do not recursively load unlimited reply trees in a single request.

==================================================
PHASE 5: FEED AND DISCOVERY ARCHITECTURE
==================================================

Replace the current fixed "50 most recent posts" model with a scalable feed architecture.

Do not rely on offset pagination for feeds expected to grow large.

Implement cursor-based pagination where appropriate.

Create:

1. Home feed
2. Following feed
3. Profile feed
4. Post thread view

The initial feed ranking should remain simple and understandable.

Prioritize:

- Recent posts from followed users
- Recent content
- Basic engagement signals where appropriate

Do not prematurely build a complicated AI recommendation engine.

Keep feed ranking modular so it can be improved later.

Implement proper loading states.

Use optimistic updates carefully and reconcile failures correctly.

Do not silently lose user actions when the network fails.

==================================================
PHASE 6: MEDIA ARCHITECTURE
==================================================

Add a production-ready media architecture.

Use Cloudflare-native services where appropriate.

Evaluate Cloudflare R2 and other compatible services for media storage.

Do not store large media files directly in D1.

Support image uploads first.

The architecture should later support:

- Multiple images
- Video
- Thumbnails
- Image variants
- Media metadata

Implement:

- Server-side authorization for uploads
- File type validation
- MIME validation
- File size limits
- Upload progress where feasible
- Retry handling
- Failed upload recovery
- Safe media deletion
- Orphaned media cleanup strategy

Do not trust only the file extension supplied by the browser.

Do not expose storage secrets to the frontend.

Design media access according to content visibility and privacy requirements.

==================================================
PHASE 7: NOTIFICATIONS
==================================================

Create a proper notification system.

Support notifications for:

- New follower
- Like
- Reply
- Mention
- Other important social actions

Requirements:

- Read/unread state
- Pagination
- Notification grouping where useful
- Deep linking to relevant content
- User notification preferences architecture

Separate notification creation from delivery.

The architecture should support future:

- In-app notifications
- Push notifications
- Email notifications

without duplicating business logic.

Avoid generating excessive or duplicate notifications.

==================================================
PHASE 8: SEARCH AND DISCOVERY
==================================================

Implement search for:

- Users
- Posts
- Hashtags

Include:

- Debounced search
- Pagination
- Empty states
- Error states
- Recent searches where appropriate

Design the search layer so it can later move to a dedicated search service if D1-based search becomes insufficient.

Do not overengineer search infrastructure at this stage.

==================================================
PHASE 9: REAL-TIME ARCHITECTURE
==================================================

Evaluate the appropriate Cloudflare-native approach for real-time features.

Prepare or implement real-time capabilities for:

- Live notifications
- New replies
- Like updates where useful
- Future messaging

Use an architecture that handles:

- Reconnection
- Temporary network loss
- Duplicate events
- Offline users
- Authorization
- Connection cleanup

Do not make real-time functionality a requirement for the basic application to function.

If the real-time layer fails, the normal REST/API functionality should continue working.

Do not build a complex chat system until the social foundation is stable.

However, structure the application so future direct messaging can be added cleanly.

==================================================
PHASE 10: TRUST, SAFETY AND MODERATION
==================================================

Implement the foundation for platform moderation.

Users should be able to:

- Report posts
- Report users
- Block users

Create administrative and moderation architecture supporting:

- Moderation roles
- Report review
- Content status
- Account suspension
- Content removal
- Audit logs for sensitive administrative actions

Use clear content states such as:

- Active
- Under review
- Hidden
- Removed

Do not permanently delete reported content immediately if it needs to remain available for moderation review.

Ensure blocked users are consistently handled across:

- Feeds
- Profiles
- Interactions
- Notifications
- Future messaging

==================================================
PHASE 11: SECURITY HARDENING
==================================================

Perform a security review of the entire application.

Address relevant risks including:

- Broken authentication
- Broken access control
- IDOR vulnerabilities
- SQL injection
- XSS
- CSRF where applicable
- Unsafe file uploads
- API abuse
- Brute-force attacks
- Enumeration attacks
- Rate limiting

Implement appropriate security measures for Cloudflare Workers and Hono.

Add rate limiting to sensitive operations such as:

- Login
- Registration
- Password reset
- Post creation
- Likes
- Follow actions
- Reports

Validate all request bodies server-side.

Never rely exclusively on frontend validation.

Do not expose stack traces, database details, or secrets in production API responses.

Centralize error handling.

==================================================
PHASE 12: PREMIUM UI/UX
==================================================

Redesign and refine the existing interface into a premium, modern social product.

Do not copy the visual identity of Facebook, Instagram, X, Threads, TikTok, or any other existing platform.

Create an original design system based on the application's own identity.

Build reusable UI foundations for:

- Typography
- Colors
- Spacing
- Buttons
- Inputs
- Avatars
- Cards
- Menus
- Modals
- Bottom sheets
- Toast notifications
- Skeleton loaders
- Empty states
- Error states

Prioritize:

- Strong visual hierarchy
- Excellent readability
- Comfortable spacing
- Fast interactions
- Touch-friendly controls
- Mobile-first layouts
- Responsive desktop layouts
- Keyboard accessibility
- Dark mode architecture

Avoid excessive visual effects.

Do not make every section look like a floating rounded card.

Use animations sparingly and purposefully.

The interface should feel polished and intentional, not like a generic AI-generated dashboard.

==================================================
PHASE 13: MOBILE, SLOW NETWORK AND OFFLINE RESILIENCE
==================================================

Treat mobile as a first-class platform.

Test and improve:

- Small screens
- Touch targets
- Mobile navigation
- Keyboard behavior
- Safe areas
- Image uploads
- Slow connections
- Temporary connection loss

Implement graceful handling for failed requests.

Where practical:

- Preserve post drafts
- Preserve unsent content
- Allow retrying failed actions
- Show clear connection errors
- Prevent accidental data loss

Do not silently discard user-generated content.

Avoid unnecessarily large frontend bundles.

Use lazy loading and code splitting where beneficial.

==================================================
PHASE 14: PERFORMANCE AND SCALABILITY
==================================================

Optimize the application for growth.

Review and improve:

- Database queries
- D1 indexes
- N+1 query risks
- Feed queries
- Pagination
- API payload sizes
- Frontend rendering
- Image loading
- Caching opportunities

Use caching carefully.

Do not cache personalized or private data incorrectly.

Prepare expensive operations for asynchronous or background processing where appropriate.

Identify operations that should not remain inside a synchronous user request as the platform grows.

Keep the architecture compatible with future:

- Cloudflare Queues
- Background processing
- R2 media storage
- Durable Objects where genuinely useful
- Workers scaling
- Dedicated search infrastructure

Do not introduce these services merely because they exist.

Use them only when they solve a real architectural problem.

==================================================
PHASE 15: API QUALITY AND FUTURE MOBILE APPS
==================================================

Treat the backend as an API capable of supporting future native mobile applications.

The React frontend should not contain critical business rules that a future Android or iOS application would need to duplicate.

Create consistent API conventions for:

- Authentication
- Success responses
- Validation errors
- Authorization errors
- Not found errors
- Pagination
- Resource identifiers

Keep shared TypeScript contracts organized.

Where appropriate, improve shared/types.ts so request and response contracts remain reliable.

Prepare for API versioning without unnecessarily creating multiple API versions now.

==================================================
PHASE 16: TESTING AND RELEASE READINESS
==================================================

Add testing appropriate to the existing stack.

Prioritize tests for:

- Authentication
- Authorization
- Post ownership
- Post creation
- Replies
- Likes
- Follows
- Blocks
- Feed pagination
- Input validation
- Rate limiting where testable
- Privacy and access boundaries

Run:

- TypeScript checks
- Linting
- Production builds

Fix errors introduced during the upgrade.

Do not leave the repository in a state where the build passes only because type checks or lint rules were weakened.

==================================================
PHASE 17: PRODUCTION OPERATIONS
==================================================

Prepare Chirp for real deployment.

Review:

- wrangler.jsonc
- Environment variables
- D1 configuration
- Production secrets
- Deployment process
- Migration process

Create or improve:

- .env.example
- Deployment documentation
- Database migration instructions
- Rollback strategy
- Backup and recovery notes
- Production checklist

Ensure development and production environments are clearly separated.

Do not commit secrets.

Use Cloudflare Workers environment bindings and secrets appropriately.

==================================================
IMPLEMENTATION ORDER
==================================================

Do not implement everything simultaneously.

Follow this order:

PHASE A
Architecture audit and repository inspection

PHASE B
Authentication, authorization, and user model

PHASE C
Database hardening and social graph

PHASE D
Premium post, thread, profile, and feed experience

PHASE E
Media storage and uploads

PHASE F
Notifications, search, and discovery

PHASE G
Moderation, reporting, blocking, and administration

PHASE H
Performance, security hardening, testing, and production readiness

PHASE I
Advanced features only after the foundation is stable

After each phase:

1. Review what changed.
2. Run relevant checks.
3. Fix regressions.
4. Confirm existing functionality still works.
5. Summarize completed work.
6. Identify remaining risks before moving forward.

==================================================
FINAL NON-NEGOTIABLE REQUIREMENTS
==================================================

- Do not rebuild Chirp from scratch.
- Do not remove existing functionality unnecessarily.
- Preserve backwards compatibility where reasonably possible.
- Do not trust x-chirp-user or any client-supplied identity as authentication.
- Remove the insecure identity model only after safely migrating the application to real authentication.
- Do not expose secrets.
- Do not trust frontend authorization.
- Do not create non-functional UI.
- Do not add unnecessary infrastructure.
- Do not overengineer features before the core platform is secure.
- Do not use fixed 50-item feed queries as the long-term feed architecture.
- Do not use unbounded database queries.
- Do not silently lose user-generated content.
- Use safe database migrations.
- Keep the backend suitable for future native mobile clients.
- Keep mobile and slow-network users in mind throughout development.
- Prefer Cloudflare-native services when they fit the existing architecture, but only when technically justified.
- Maintain strong TypeScript contracts.
- Run linting, type checks, and production builds after major changes.

START NOW WITH PHASE A ONLY.

First inspect the complete repository and produce the architecture audit.

Then propose the exact files, database migrations, API changes, and implementation sequence required for Phase B.

Do not begin implementing Phase B until the architecture audit and implementation plan are complete.