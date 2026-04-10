# Holly PRM - Phase 4 Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Phase 4 - Calendar and Email

---

## Overview

Phase 4 adds three connected features: an in-app calendar view, Gmail integration, and Google Calendar sync. All three share a single Google OAuth connection stored in the database. The calendar view is usable immediately without Google connected; Gmail and Calendar sync activate once the user connects.

---

## Pillars

1. **Google Connection Layer** - dedicated OAuth flow in Settings, token storage, auto-refreshing client
2. **Calendar View** - multi-view in-app calendar at `/calendar` with filter preferences
3. **Gmail Integration** - periodic polling + Holly on-demand endpoint, emails surfaced in briefing
4. **Google Calendar Sync** - bidirectional: PRM items pushed to Google Calendar, Google events pulled into calendar view

---

## Schema Changes

Three new tables. No changes to existing tables.

### GoogleToken

Stores the connected Google account's credentials. At most one row exists (single-user app).

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| email | String | Google account email |
| accessToken | String | Encrypted at rest via AES-256-GCM using `ENCRYPTION_KEY` env var |
| refreshToken | String | Encrypted at rest |
| expiresAt | DateTime | When the current access token expires |
| scopes | String[] | Granted OAuth scopes |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### CalendarSync

Maps PRM items to Google Calendar events for push sync.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| entityType | Enum | `task`, `project`, `action_item`, `follow_up` |
| entityId | String | ID of the PRM item |
| googleEventId | String | Google Calendar event ID |
| calendarId | String | Always `"primary"` |
| createdAt | DateTime | |

### UserPreference

Stores per-user UI preferences as JSON. At most one row exists.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| calendarFilters | Json | `{ tasks, projects, followUps, milestones, actionItems, googleEvents }` - each boolean, all default true |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Migrations

```sql
-- GoogleToken
CREATE TABLE "GoogleToken" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "scopes" TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CalendarSync
CREATE TYPE "CalendarEntityType" AS ENUM ('task', 'project', 'action_item', 'follow_up');
CREATE TABLE "CalendarSync" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "entityType" "CalendarEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "googleEventId" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL DEFAULT 'primary',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CalendarSync_entityType_entityId_key" ON "CalendarSync"("entityType", "entityId");

-- UserPreference
CREATE TABLE "UserPreference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "calendarFilters" JSONB NOT NULL DEFAULT '{"tasks":true,"projects":true,"followUps":true,"milestones":true,"actionItems":true,"googleEvents":true}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
```

---

## Google Connection Layer

### OAuth Flow

Two new routes handle the OAuth dance:

- `GET /api/v1/google/connect` - initiates OAuth. Generates a state token (stored in Redis for 10 minutes), redirects to Google's authorization URL with scopes `gmail.readonly https://www.googleapis.com/auth/calendar` and `access_type=offline&prompt=consent`.
- `GET /api/v1/google/callback` - OAuth callback. Validates state, exchanges code for tokens, encrypts and upserts into `GoogleToken`, redirects to `/settings`.

### Token Client

`lib/google.ts` exports:

```ts
getGoogleClient(): Promise<OAuth2Client>
```

Reads the single `GoogleToken` row. If `expiresAt` is within 5 minutes, refreshes using the refresh token and updates the row. Returns a configured `google-auth-library` `OAuth2Client`. Throws `GoogleNotConnectedError` if no token row exists.

All Gmail and Calendar service functions call `getGoogleClient()` first. They catch `GoogleNotConnectedError` and return null/empty rather than throwing.

### Encryption

`lib/encryption.ts` exports `encrypt(text: string): string` and `decrypt(text: string): string` using Node's `crypto` module with AES-256-GCM. Key comes from `ENCRYPTION_KEY` environment variable (32-byte hex string). The encrypted format is `iv:authTag:ciphertext` as hex, stored as a single string.

### Settings UI

Settings page gains a "Google" section:

- If not connected: shows "Connect Google" button that links to `/api/v1/google/connect`
- If connected: shows the connected email address and a "Disconnect" button. Disconnect calls `DELETE /api/v1/google/disconnect`, which deletes the `GoogleToken` row and revokes the token with Google, then redirects to `/settings`

---

## New Routes

### Google OAuth

```
GET  /api/v1/google/connect      Initiate OAuth flow
GET  /api/v1/google/callback     OAuth callback handler
DELETE /api/v1/google/disconnect Revoke and delete token
```

### Calendar UI

```
GET  /calendar                   Calendar page (server component for data, client component for view switching)
POST /api/v1/calendar/preferences  Save filter preferences
```

### Gmail Holly API

```
GET  /api/holly/v1/gmail/recent  On-demand Gmail fetch (?hours=24)
```

### New UI Route

```
/calendar                        Calendar view with month/week/agenda switching
```

---

## Calendar View

### Route

`/calendar` - the page component fetches PRM data server-side and passes it to a client component that handles view switching and filter state.

### Navigation

Add "Calendar" to sidebar and bottom nav. Bottom nav currently has 6 items after Phase 3 (Home, Contacts, Log, Projects, Tasks, Reports). Calendar replaces one slot or the spec accepts 7 items - to be determined during implementation based on mobile fit. Desktop sidebar has no slot constraint.

### Data Sources

Each calendar event has a type, title, date, and optional link:

| Type | Source | Date field | Link |
|------|--------|-----------|------|
| `task` | Task | `dueDate` | `/projects/[projectId]` |
| `project` | Project | `targetDate` | `/projects/[id]` |
| `follow_up` | Interaction | `followUpDate` | `/contacts/[contactId]` |
| `milestone` | Task where `isMilestone=true` | `dueDate` | `/projects/[projectId]` |
| `action_item` | ActionItem | `dueDate` | none |
| `google_event` | Google Calendar | event start | none (display only) |

Items without a date are excluded. Completed/cancelled items are excluded (status `done` or `cancelled`). Follow-ups where `followUpCompleted=true` are excluded.

### Filter Preferences

Stored in `UserPreference.calendarFilters`. A filter toggle form at the top of the page - native HTML checkboxes in a form that POSTs to `/api/v1/calendar/preferences` and redirects back. No client-side JS required for filter changes.

### Views

All three views are rendered in a single client component `CalendarView` that accepts pre-fetched events and manages local view state.

**Month view:** 7-column CSS grid. Each day cell shows event count indicator and up to 3 event titles (truncated). Click a day to expand (show all events for that day in a popover-style panel). Prev/next navigation changes the displayed month.

**Week view:** 7-column CSS grid showing the current week. Events listed vertically within each day column in time order. Prev/next navigation moves by 7 days.

**Agenda view:** Flat list grouped by date. Shows all events from today forward for 30 days. No navigation needed - always anchored to today.

View switcher: three buttons (Month / Week / Agenda) that update local state. Selected view persists in `sessionStorage` so page refresh restores the last view.

### Implementation Notes

- No charting or calendar libraries - pure Tailwind CSS grid
- Google Calendar events shown with a `G` badge to distinguish them from PRM items
- The `CalendarView` client component receives typed event arrays as props from the server component - no client-side data fetching

---

## Gmail Integration

### `lib/services/gmail.ts`

```ts
fetchRecentEmails(options: { hours?: number }): Promise<GmailEmail[]>
```

- Calls `getGoogleClient()` - returns `[]` if not connected
- Queries Gmail API for messages in the last `hours` (default 24) where sender or recipient matches any email address stored in the Contact model's `emails` JSON field
- Returns structured results: `{ threadId, subject, from, to, snippet, date, contactId, contactName }`
- Emails matching multiple contacts use the first match

```ts
getEmailThread(threadId: string): Promise<GmailThread | null>
```

- Fetches the full thread content from Gmail API
- Returns `{ threadId, subject, messages: [{ from, to, date, body }] }` or null if not connected/not found

### Cron Integration

`/api/v1/cron/notify` gains a Gmail poll step after the existing SSE publish step:

1. Check if `GoogleToken` row exists. If not, skip.
2. Call `fetchRecentEmails({ hours: 24 })`.
3. Store result in Redis under key `gmail:recent` with TTL 3600 (1 hour).
4. No push notification or SSE event is fired - the data is available for the next briefing request.

### Briefing Extension

`/api/holly/v1/briefing` gains a `recentEmails` field:

```json
{
  "recentEmails": [
    {
      "threadId": "18f3a2...",
      "subject": "Re: Walker project",
      "from": "john@example.com",
      "contactId": "uuid",
      "contactName": "John Smith",
      "snippet": "Sounds good, let me check...",
      "date": "2026-04-10T09:00:00Z"
    }
  ]
}
```

The briefing service reads from Redis key `gmail:recent`. If the key is absent (no poll yet today, or Google not connected), `recentEmails` is an empty array - never an error.

### Holly On-Demand Endpoint

`GET /api/holly/v1/gmail/recent?hours=24`

- Requires `X-Holly-API-Key` (same auth as all Holly API routes)
- Bypasses Redis cache - calls Gmail API directly
- Returns `{ emails: GmailEmail[], fetchedAt: string }`
- Returns `{ emails: [], googleConnected: false }` if no token

---

## Google Calendar Sync

### `lib/services/calendar-sync.ts`

```ts
upsertCalendarEvent(
  entityType: CalendarEntityType,
  entityId: string,
  event: { title: string; description?: string; date: Date }
): Promise<void>
```

- Calls `getGoogleClient()` - returns silently if not connected
- Looks up existing `CalendarSync` row for `(entityType, entityId)`
- If found: updates the existing Google Calendar event
- If not found: creates a new Google Calendar event, inserts `CalendarSync` row
- Event is created as an all-day event on the date
- On Google API error: logs error, does not throw (PRM operations must not fail due to sync failures)

```ts
deleteCalendarEvent(entityType: CalendarEntityType, entityId: string): Promise<void>
```

- Looks up `CalendarSync` row. If not found, returns silently.
- Deletes the Google Calendar event
- Deletes the `CalendarSync` row

### Service Integration

Push sync is added to existing service functions. All calls are fire-and-forget (no `await` at the service level - the sync function handles its own errors internally):

| Service function | Trigger | Event title |
|----------------|---------|-------------|
| `createTask` / `updateTask` | `dueDate` is set | Task title |
| `createProject` / `updateProject` | `targetDate` is set | Project title |
| `createActionItem` | `dueDate` is set | Action item title |
| `updateInteraction` | `followUpDate` is set | "Follow-up: [contact name]" |
| `deleteTask` | always | - (delete) |
| `deleteProject` | always | - (delete) |

If a `dueDate` / `targetDate` is cleared (set to null), the corresponding Google Calendar event is deleted.

### Pull (Google Calendar → Calendar View)

`fetchGoogleEvents(days: number): Promise<GoogleCalendarEvent[]>`

- Called from the `/calendar` page server component on each page load
- Fetches upcoming events from the primary Google Calendar for the next `days` days
- Returns `{ googleEventId, title, date, calendarId }[]`
- Returns `[]` if not connected
- Results are not persisted - merged in memory with PRM items before passing to the client component

---

## Error Handling

- `GoogleNotConnectedError` - thrown by `getGoogleClient()` when no token row exists. All callers catch this and return empty/null rather than propagating.
- Google API errors (token refresh failure, quota exceeded, network error) - logged server-side with `console.error`, not exposed to users. Calendar sync errors do not fail PRM operations.
- OAuth state mismatch on callback - returns HTTP 400 with redirect to `/settings?error=oauth_failed`
- Missing `ENCRYPTION_KEY` env var - throws at startup (surfaced in server logs)

---

## Security

- `ENCRYPTION_KEY` is a 32-byte hex string stored as an environment variable - never committed
- OAuth state token is a random UUID stored in Redis with 10-minute TTL - prevents CSRF on the callback
- All new `/api/v1/*` routes require active session (existing middleware)
- Holly API Gmail endpoint requires `X-Holly-API-Key` (existing middleware)
- Tokens are never returned to the client - only the connected email address is shown in Settings

---

## Out of Scope for Phase 4

- Gmail write (send emails) - Phase 6 or later
- Gmail push notifications via Pub/Sub - too much infrastructure for single-user
- Multiple Google Calendar support (only primary calendar)
- Google Contacts sync
- Obsidian bridge (Phase 5)
- Multi-user (Phase 6)
