# Holly PRM - Administrator Guide

## Overview

This guide covers the administrative functions of Holly PRM. The administrator account is a special credentials-based account defined by environment variables (`ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH`). It is separate from regular user accounts and is used to manage the system, not for day-to-day PRM work.

The admin has full access to all system pages plus the Admin panel. Regular users cannot see or access the Admin panel.

## Logging In

1. Navigate to the Holly PRM login page
2. Enter the admin email and password configured during deployment
3. The sidebar will show all standard navigation items plus an "Admin" link at the bottom

The admin account is created automatically on first login. It gets a real database user record so it can own data, but its credentials are validated against the environment variables, not the database.

## The Admin Panel

Access the Admin panel from the sidebar. It has six sections:

### Pending Approval

When new users register (via the registration page or Google OAuth), their accounts start in "pending" status. They cannot access the system until an administrator approves them.

This section shows all pending registration requests with:
- User name and email address
- Approve button - grants system access
- Reject button - denies the request

Users are notified by email when their account is approved or rejected (if email is configured via Resend).

### Approved Users

Lists all users with approved status. Each entry shows:
- Name and email
- Revoke button - removes system access (sets status back to rejected)

**What users can do once approved:**
- Log in and access all standard features (Dashboard, Contacts, Projects, Tasks, Calendar, Reports, Profile, Settings)
- Create and manage their own contacts, projects, tasks, interactions, and action items
- Connect their Google account for Gmail and Calendar integration
- Set up scheduling preferences, roles, and goals
- Share contacts with other approved users (if granted access)
- View read-only Obsidian Vault status on their Profile page
- Mark their projects as "Shared" to let all approved users see and contribute
- Assign tasks on shared projects to any approved user

**What users cannot do:**
- Access the Admin panel or any admin API routes
- Approve or reject other user registrations
- Revoke other users' access
- Create access grants between arbitrary users (only admin can do this)
- Claim unclaimed data records
- See data belonging to other users (unless explicitly shared)
- Generate Holly API keys (admin-only)
- Configure Obsidian vault connection or trigger vault sync (admin-only)

### Claim Unclaimed Data

This is a one-time migration tool. After the initial system setup or when migrating from a single-user configuration to multi-user, some records may not have a userId assigned. This tool assigns all ownerless records to a selected approved user.

1. Select an approved user from the dropdown
2. Click "Claim all unclaimed records"
3. The system reports how many records were assigned

Run this once after initial setup. Running it again is harmless but will have no effect if all records already have owners.

### Access Grants

Controls cross-user data sharing. Access grants allow one user (the grantee) to read and contribute to another user's (the grantor) contact book.

**Creating a grant:**
1. Enter the grantor's email (the user whose contacts will be shared)
2. Enter the grantee's email (the user who will gain read+contribute access)
3. Click Create

**What a grant allows:**
- The grantee can see all of the grantor's contacts
- The grantee can add interactions to those contacts
- The grantee can see "Shared by [name]" attribution on shared contacts
- The grantee cannot edit or delete the grantor's contacts
- The grantee cannot see the grantor's projects, tasks, or other data

**Revoking a grant:**
Click the Revoke button next to any existing grant. The grantee immediately loses access.

### Holly API Keys

Holly (Openclaw) is an AI assistant that connects to the PRM via API keys. Because the keys grant programmatic access to system data, they are managed centrally by the administrator.

**Generating a key:**
1. Enter a descriptive name (e.g. "Holly production")
2. Click Generate
3. Copy the plaintext key immediately - it is only shown once
4. Configure Holly with this key

**Revoking a key:**
Click Revoke next to any existing key. Any agents still using that key will lose access immediately.

Existing keys are listed with their name and last-used date but never reveal the plaintext value again.

### Obsidian Vault

Connects Holly PRM to an Obsidian vault via the Self-hosted LiveSync CouchDB backend. This is a single shared vault configuration for the deployment.

**CouchDB connection:**
- URL - the CouchDB endpoint (e.g. http://localhost:5984)
- Database - the database name (e.g. obsidian)
- Username and Password - CouchDB credentials
- E2E passphrase - the LiveSync end-to-end encryption passphrase

Click Test to verify connectivity and passphrase validity.

**Sync schedule:**
Choose cron presets for weekdays and weekends:
- Every hour
- Every 2 hours
- Every 4 hours
- Twice daily (9am and 5pm)
- Once daily (9am)

**Actions:**
- Sync enabled checkbox - toggle whether scheduled syncs run
- Save - persist the configuration
- Sync now - trigger an immediate sync

Users see a read-only vault status on their Profile page (Configured / Not Configured, Accessible yes/no, Last sync timestamp) but cannot edit the configuration.

## User Registration Flow

1. A potential user visits the registration page and submits their name, email, and password
2. Alternatively, a user signs in with Google OAuth for the first time
3. The account is created with "pending" status
4. The user sees a "pending approval" message and cannot access the system
5. The admin sees the pending request in the Admin panel
6. The admin approves or rejects the request
7. If approved, the user can log in and access all standard features

## Environment Configuration

The admin account is configured via these environment variables:

- `ADMIN_EMAIL` - The email address used to log in as admin
- `ADMIN_PASSWORD_HASH` - A bcrypt hash of the admin password (cost factor 12)

To generate a password hash, use: `npx bcryptjs hash "your-password" 12`

Other key environment variables:
- `AUTH_SECRET` - NextAuth.js secret for session encryption
- `AUTH_URL` - The public URL of the application (e.g. https://holly.example.com)
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string (for caching and SSE events)
- `CRON_SECRET` - Bearer token for the cron endpoint
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - For Google OAuth and Gmail/Calendar integration
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` - For push notifications
- `RESEND_API_KEY` - For sending emails (registration, approval, password reset)

## Cron Job Setup

Holly PRM uses a single cron endpoint (`POST /api/v1/cron/notify`) that handles:
- Overdue contact notifications (push + SSE)
- Gmail polling and caching
- Obsidian vault sync
- Scheduling engine: urgency refresh and automatic rescheduling

Configure an external service (e.g. Coolify cron, uptime monitor, or cron-job.org) to POST to this endpoint with the Authorization header `Bearer {CRON_SECRET}`. Recommended frequency: every 15-60 minutes.

## Database Migrations

When deploying new versions, the container startup command runs `prisma migrate deploy` before starting the application. Migrations are applied automatically. If a migration fails, the application will not start - check the container logs for the specific error.

## Troubleshooting

**Users cannot log in after approval:**
- Verify the user's status is "approved" in the Admin panel
- For Google OAuth users, they must sign in with Google (not credentials) unless they also set a password via the forgot-password flow

**502 Bad Gateway after deployment:**
- Check container logs for migration errors
- Verify DATABASE_URL is correct and the database is accessible
- Check that all required environment variables are set

**Push notifications not working:**
- Verify VAPID keys are configured
- Users must enable notifications in their browser and in Settings
- The cron job must be running to trigger notification sending

**Gmail/Calendar integration issues:**
- Verify GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI are correct
- The redirect URI must match exactly what is configured in the Google Cloud Console
- Users connect their Google account individually via Settings

**Vault sync issues:**
- Vault configuration is admin-only (Admin panel > Obsidian Vault)
- The E2E passphrase must match the LiveSync configuration
- Test the connection in the Admin panel before enabling sync
- Users can view the current vault status (configured/accessible/last sync) on their Profile page
