# Holly PRM - Phase 6b Design Spec

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Phase 6b - Email, Password Reset, User Profile

---

## Overview

Phase 6b adds email infrastructure and wires it into three user lifecycle notifications (registration received, account approved, account rejected), a self-service password reset flow, and a user profile page for editing name, email, and password.

---

## Pillars

1. **Email infrastructure** - Resend client, send helper, email templates
2. **Email notifications** - hook into existing registration and admin approval routes
3. **Password reset** - forgot-password and reset-password pages and routes
4. **User profile page** - edit name, email, and password

---

## Tech Stack Addition

**Resend** (`resend` npm package) for email delivery.

New environment variables:
- `RESEND_API_KEY` - Resend API key
- `EMAIL_FROM` - sender address (e.g. `holly@yourdomain.com`)

---

## Schema Changes

One new table. No changes to existing tables.

### PasswordResetToken

Stores single-use, short-lived password reset tokens.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| userId | String | FK to User, onDelete Cascade |
| tokenHash | String | SHA-256 hash of the plaintext token |
| expiresAt | DateTime | 1 hour from creation |
| usedAt | DateTime? | Set on consumption; null = unused |
| createdAt | DateTime | |

Token lifetime: 1 hour. Single-use: `usedAt` is set on successful consumption. Expired or used tokens return 400.

---

## File Structure

**New files:**
- `lib/email.ts` - Resend client initialisation and `sendEmail(to, subject, html)` helper
- `lib/email-templates.ts` - one exported function per email type, returns `{ subject: string, html: string }`
- `lib/services/password-reset.ts` - `createResetToken(userId)`, `validateResetToken(token)`, `consumeResetToken(token, newPassword)`
- `app/(auth)/forgot-password/page.tsx` - email input form
- `app/(auth)/reset-password/page.tsx` - new password form, reads `?token=` from URL
- `app/api/auth/forgot-password/route.ts` - POST handler
- `app/api/auth/reset-password/route.ts` - POST handler
- `app/(dashboard)/profile/page.tsx` - profile edit page
- `app/api/v1/profile/route.ts` - PATCH handler for name/email
- `app/api/v1/profile/password/route.ts` - PATCH handler for password change

**Modified files:**
- `app/api/auth/register/route.ts` - add registration received email
- `app/api/admin/users/[id]/approve/route.ts` - add approval email
- `app/api/admin/users/[id]/reject/route.ts` - add rejection email
- Dashboard nav component - add Profile link
- `prisma/schema.prisma` - add PasswordResetToken model

---

## Email Infrastructure

### `lib/email.ts`

Initialises the Resend client from `RESEND_API_KEY`. Exports a single helper:

```ts
export async function sendEmail(to: string, subject: string, html: string): Promise<void>
```

Fire-and-forget safe: the function catches all errors and logs them with `console.error`. Callers do not need try/catch. A failed email never propagates to the caller.

### `lib/email-templates.ts`

Four exported functions, each returning `{ subject: string, html: string }`:

```ts
export function registrationReceivedEmail(name: string): { subject: string, html: string }
export function accountApprovedEmail(name: string, signInUrl: string): { subject: string, html: string }
export function accountRejectedEmail(name: string): { subject: string, html: string }
export function passwordResetEmail(name: string, resetUrl: string): { subject: string, html: string }
```

Templates are plain HTML strings. No template engine. Content:

- **registrationReceived**: "Hi [name], your registration request has been received. You will be notified when your account is approved."
- **accountApproved**: "Hi [name], your account has been approved. Sign in at [signInUrl]."
- **accountRejected**: "Hi [name], your registration request was not approved."
- **passwordReset**: "Hi [name], click the link below to reset your password. This link expires in 1 hour. [resetUrl] If you did not request a password reset, ignore this email."

---

## Email Notifications

No new routes. Notifications are added to existing route handlers.

| Route | Trigger | Recipient | Template |
|-------|---------|-----------|----------|
| `POST /api/auth/register` | User created with status=pending | New user | `registrationReceivedEmail` |
| `POST /api/admin/users/[id]/approve` | Status set to approved | Approved user | `accountApprovedEmail` |
| `POST /api/admin/users/[id]/reject` | Status set to rejected | Rejected user | `accountRejectedEmail` |

All calls are fire-and-forget: `sendEmail(...)` is called without `await` after the DB operation succeeds (or with `await` but errors swallowed inside `sendEmail`). The API response does not depend on email delivery.

---

## Password Reset Flow

### Token generation

`createResetToken(userId: string): Promise<string>` in `lib/services/password-reset.ts`:
1. Generate 32 random bytes, encode as hex (64-char plaintext token)
2. SHA-256 hash the token
3. Upsert `PasswordResetToken` row: `{ userId, tokenHash, expiresAt: now + 1 hour }` - invalidates any existing unused token for the user by deleting prior rows first
4. Return the plaintext token (included in the reset URL, never stored)

### Token validation

`validateResetToken(token: string): Promise<User | null>`:
1. SHA-256 hash the input token
2. Find `PasswordResetToken` where `tokenHash = hash AND usedAt = null AND expiresAt > now`
3. Return the associated User if found, null otherwise

### Token consumption

`consumeResetToken(token: string, newPassword: string): Promise<boolean>`:
1. Validate token (returns false if invalid)
2. bcrypt hash the new password
3. In a transaction: set `token.usedAt = now`, update `user.passwordHash`
4. Return true

### Routes

**`POST /api/auth/forgot-password`** - body: `{ email: string }`
- Always returns 200 (prevents user enumeration)
- Looks up User by email; if not found or not a credential user (passwordHash is null), returns 200 silently
- If found and approved: calls `createResetToken`, sends `passwordResetEmail` with `NEXTAUTH_URL/auth/reset-password?token=[plaintext]`
- If found and pending/rejected: returns 200 silently (no reset for unapproved users)

**`POST /api/auth/reset-password`** - body: `{ token: string, password: string }`
- Validates password length (min 8 chars)
- Calls `consumeResetToken`; returns 400 with `{ error: "Invalid or expired reset link" }` if false
- Returns 200 on success

### Pages

**`/auth/forgot-password`** - email input form. On submit: POST to `/api/auth/forgot-password`. On response (always 200): show "If that email is registered, you will receive a reset link shortly."

**`/auth/reset-password`** - reads `?token=` from URL on mount. Shows new password + confirm password fields. On submit: POST to `/api/auth/reset-password`. On 400: show "This reset link is invalid or has expired." On 200: redirect to `/auth/signin` with a success message.

Both pages use the same layout as `/auth/signin` and `/auth/register`.

---

## User Profile Page

### Route: `/profile`

Accessible to authenticated users with `role: "user"` only (middleware returns 401 for admin session and unauthenticated requests).

Two independent sections on the page:

### Identity section

Fields: Name (text), Email (text). Pre-populated from session.

**`PATCH /api/v1/profile`** - body: `{ name?: string, email?: string }`
- Requires `session.userId`
- Validates: name non-empty if provided, email valid format if provided
- If email changes: checks uniqueness (`prisma.user.findFirst({ where: { email, NOT: { id: userId } } })`); returns 422 `{ error: "Email already in use" }` if taken
- Updates `user.name` and/or `user.email`
- Returns updated `{ name, email }`

### Password section

Only rendered when the user has a `passwordHash` (credential users). Hidden for Google OAuth users.

Fields: Current password, New password (min 8 chars), Confirm new password (client-side match check).

**`PATCH /api/v1/profile/password`** - body: `{ currentPassword: string, newPassword: string }`
- Requires `session.userId`
- Fetches user, returns 404 if not found
- Returns 400 `{ error: "Current password is incorrect" }` if bcrypt compare fails
- bcrypt hashes new password, updates `user.passwordHash`
- Returns 200

To determine whether to show the password section, the profile page server component fetches `prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, passwordHash: true } })` and passes `hasPassword: passwordHash !== null` to the client component.

### Navigation

Add a "Profile" link to the dashboard sidebar/nav, pointing to `/profile`.

---

## Error Handling

| Scenario | Response |
|----------|----------|
| Forgot-password with unknown/Google/unapproved email | 200 (silent) |
| Reset token invalid, expired, or already used | 400 `{ error: "Invalid or expired reset link" }` |
| Profile email already in use | 422 `{ error: "Email already in use" }` |
| Profile password - current password wrong | 400 `{ error: "Current password is incorrect" }` |
| Profile route with no userId in session | 401 |
| Email send failure | Logged, swallowed - primary operation unaffected |

---

## Security

- Reset tokens are never stored in plaintext - only SHA-256 hashes
- Tokens expire in 1 hour and are single-use
- Forgot-password route always returns 200 to prevent user enumeration
- Password changes require current password verification
- Profile routes require `session.userId` from JWT - never from request body

---

## Out of Scope for Phase 6b

- Email verification when changing email address
- Google OAuth account linking/unlinking
- Account deletion
- Session revocation on password change
- Contact and interaction sharing (Phase 6c)
