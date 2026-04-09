# Holly PRM - Phase 1 Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Phase 1 - Foundation + PRM Core

---

## Overview

Holly is a personal relationship and project management platform for Ian Openclaw and his AI assistant Holly (Openclaw). It is a single-user Progressive Web Application deployed to vaelerian.uk via Coolify on a VPS.

Phase 1 delivers the foundation and PRM core: a working contact manager, interaction logger, and Holly API. It is the first shippable version of the system - fully usable as a standalone PRM from day one.

---

## Project Decomposition

The full system is divided into 6 phases, each independently shippable:

| Phase | Name | Description |
|-------|------|-------------|
| 1 (this spec) | Foundation + PRM Core | Auth, DB, contacts, interactions, Holly API basics |
| 2 | PPM Core | Projects, tasks, milestones, action item extraction |
| 3 | Holly API Extended | SSE stream, bulk operations, project/task endpoints |
| 4 | Calendar and Email | Gmail API, Google Calendar sync |
| 5 | Knowledge Synthesis | Obsidian bridge, markdown export, knowledge queue |
| 6 | Electron Desktop App | Deferred until PWA is stable |

---

## Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript throughout |
| Styling | Tailwind CSS |
| ORM | Prisma |
| Database | PostgreSQL (Coolify-managed) |
| Cache / Sessions | Redis (Coolify-managed) |
| Auth | Auth.js v5 (NextAuth) |
| PWA | next-pwa (service worker, offline shell, background sync) |
| Real-time | Server-Sent Events (SSE) |
| Deployment | Single Docker container on Coolify |

### Deployment

One Next.js container on Coolify. PostgreSQL and Redis run as separate Coolify-managed services. Environment variables are injected at runtime. SSL is handled by Coolify via Let's Encrypt. Domain: vaelerian.uk.

### Route Structure

```
/                       Dashboard
/contacts               Contact list
/contacts/[id]          Contact detail + interaction history
/projects               Project list (Phase 2)
/tasks                  Task list (Phase 2)
/knowledge              Knowledge queue (Phase 5)
/settings               API keys, thresholds, integrations

/api/v1/contacts        REST API for Ian's web session
/api/v1/interactions
/api/v1/action-items

/api/holly/v1/contacts  Holly API (API key auth)
/api/holly/v1/interactions
/api/holly/v1/briefing
/api/holly/v1/follow-ups
/api/holly/v1/action-items
/api/holly/v1/stream    SSE event stream (Phase 3)
```

---

## Authentication

### Ian (web interface)

Auth.js v5 handles authentication with two providers:

- **Google OAuth** - primary login method, uses the same Google account as Gmail/Calendar integration
- **Credentials (email/password)** - fallback, bcrypt-hashed passwords

Sessions are stored in Redis. All `/api/v1/*` routes require a valid session. Route middleware redirects unauthenticated requests to `/login`.

### Holly (API access)

Holly authenticates with a long-lived API key passed as the `X-Holly-API-Key` request header. Keys are generated in Settings, stored as a bcrypt hash in the database, and prefixed `hky_` for identification.

All `/api/holly/v1/*` routes require a valid API key. Rate limiting is applied via Redis sliding window: 1000 requests per minute. Exceeding the limit returns HTTP 429 with a `Retry-After` header.

Holly is not a user record in the database. She is identified solely by her API key.

---

## Data Models

All six tables are created in Phase 1 so later phases only add behaviour, not schema changes.

### Contact

Stores a person Ian has a relationship with.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| name | String | Full name |
| type | Enum | personal, work, family, volunteer |
| emails | JSON | Array of email objects |
| phones | JSON | Array of phone objects |
| healthScore | Int | 0-100, recomputed on every Interaction create/update via Prisma middleware. Formula: 100 minus a penalty based on days since last interaction relative to interactionFreqDays. Defaults to 100 for new contacts. |
| lastInteraction | DateTime? | Updated automatically on Interaction create via Prisma middleware |
| interactionFreqDays | Int? | Alert threshold in days. Null = no alert |
| isFamilyMember | Boolean | Enables enhanced family profile features (Phase 2) |
| tags | String[] | Free-form categorisation |
| notes | Text | Free-form personal notes |
| preferences | JSON | Contact method, timezone, key dates, personal details |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Interaction

Every conversation, call, meeting, or event with a contact.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| contactId | UUID | Foreign key to Contact |
| type | Enum | call, meeting, email, message, event |
| direction | Enum | inbound, outbound |
| summary | Text | What was discussed |
| outcome | Text? | Result of the interaction |
| followUpRequired | Boolean | Whether a follow-up is needed |
| followUpDate | DateTime? | When to follow up |
| followUpCompleted | Boolean | Whether the follow-up was done |
| callbackExpected | Boolean | Whether a callback was promised |
| createdByHolly | Boolean | True if created via Holly API |
| location | String? | Context (walking football, work meeting, etc.) |
| duration | Int? | Duration in minutes |
| occurredAt | DateTime | When the interaction took place |

### ActionItem

Short-term tasks arising from interactions. Separate from project Tasks.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| interactionId | UUID? | Source interaction (if created from one) |
| taskId | UUID? | Link to project Task if promoted |
| title | String | |
| status | Enum | todo, done, cancelled |
| priority | Enum | low, medium, high, critical |
| assignedTo | Enum | ian, holly |
| dueDate | DateTime? | |
| createdAt | DateTime | |

### Project

Work and personal initiatives. Schema created in Phase 1, UI delivered in Phase 2.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| title | String | |
| description | Text | |
| category | Enum | personal, work, volunteer |
| status | Enum | planning, active, on-hold, done, cancelled |
| priority | Enum | low, medium, high, critical |
| targetDate | DateTime? | |
| notes | Text | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Task

Subtasks and milestones within a project. Schema created in Phase 1, UI in Phase 2.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| projectId | UUID | Foreign key to Project |
| title | String | |
| description | Text | |
| status | Enum | todo, in-progress, done, cancelled |
| priority | Enum | low, medium, high, critical |
| assignedTo | Enum | ian, holly |
| dueDate | DateTime? | |
| isMilestone | Boolean | Milestones appear on project overview |
| createdAt | DateTime | |

### AuditLog

Immutable record of every data-modifying action. Written by Prisma middleware on every create/update/delete across Contact, Interaction, and ActionItem.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| entity | String | Table name (Contact, Interaction, ActionItem) |
| entityId | UUID | ID of the affected record |
| action | Enum | create, update, delete |
| actor | Enum | ian, holly |
| diff | JSON | Before/after values for updates |
| occurredAt | DateTime | |

### KnowledgeItem

Insights flagged for Obsidian export. Schema created in Phase 1, UI in Phase 5.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| sourceId | UUID | Polymorphic reference to source record |
| sourceType | Enum | interaction, project, contact |
| content | Text | Markdown content |
| proposedCategory | String | Suggested Obsidian category |
| tags | String[] | |
| obsidianReady | Boolean | Reviewed and ready to export |
| exported | Boolean | Has been exported to Obsidian |
| createdAt | DateTime | |

---

## Holly API (Phase 1 Endpoints)

All endpoints are under `/api/holly/v1/`. All require `X-Holly-API-Key` header. All return JSON.

| Method | Path | Description |
|--------|------|-------------|
| GET | /contacts | List/search contacts. Supports `?q=`, `?type=`, `?overdue=true` |
| GET | /contacts/:id | Full contact profile with recent interactions |
| POST | /interactions | Create an interaction record |
| GET | /interactions | List recent interactions. Supports `?contactId=`, `?followUpRequired=true` |
| GET | /briefing | Aggregated morning summary (overdue contacts, pending follow-ups, active action items) |
| GET | /follow-ups | All pending follow-ups ordered by due date |
| POST | /action-items | Create an action item |
| PATCH | /action-items/:id | Update action item status |

The `/briefing` response shape:

```json
{
  "overdueContacts": [...],
  "pendingFollowUps": [...],
  "openActionItems": [...],
  "generatedAt": "2026-04-09T08:00:00Z"
}
```

---

## UI Structure

### Navigation

- **Desktop:** persistent left sidebar (160px) with full nav labels
- **Mobile:** bottom tab bar with five items: Home, Contacts, + (Log), Projects, Tasks

The `+` Log Interaction button is accessible from every screen. On mobile it sits in the centre of the bottom bar. On desktop it appears as a prominent button in the sidebar and dashboard.

The Projects and Tasks tabs appear in the mobile bottom bar and sidebar in Phase 1 but link to a "Coming in a future update" placeholder screen. This keeps the nav structure stable so Phase 2 is a drop-in addition with no nav surgery.

### Screens (Phase 1)

| Screen | Path | Description |
|--------|------|-------------|
| Dashboard | / | Relationship health alerts, pending follow-ups, recent interactions, active action items |
| Contacts | /contacts | Searchable/filterable contact list with health score indicator |
| Contact Detail | /contacts/[id] | Full profile, interaction history, follow-up status, action items |
| Log Interaction | modal | Quick-entry form accessible from any screen. Target: completable in under 30 seconds. Supports offline entry with background sync. |
| Settings | /settings | API key management, interaction frequency thresholds, notification preferences |

### Performance Targets

- Page load under 2 seconds on mobile
- Log Interaction form completable in under 30 seconds
- API responses under 500ms for standard queries
- Offline entry supported via service worker background sync

---

## PWA and Offline

- `next-pwa` generates a service worker that caches the app shell and static assets
- Interaction log entries made offline are queued via the Background Sync API and flushed when connectivity returns
- The app is installable to home screen on iOS and Android
- Web push subscription is set up in Phase 1: the service worker registers a push subscription and the endpoint is stored server-side. No notifications are sent in Phase 1. Phase 2 adds the server-side scheduler that triggers push payloads for follow-up reminders and overdue contact alerts.

---

## Error Handling

- API routes return consistent JSON error shapes: `{ "error": "message", "code": "ERROR_CODE" }`
- Validation errors return HTTP 422 with field-level detail
- Auth errors return HTTP 401 with a `WWW-Authenticate` header
- Rate limit errors return HTTP 429 with `Retry-After`
- Unhandled server errors return HTTP 500; stack traces are logged server-side only, never exposed to clients
- Client-side errors surface via toast notifications; offline state is shown via a persistent banner

---

## Security

- All routes behind auth middleware except `/login` and `/api/holly/*` (which use API key auth)
- Passwords hashed with bcrypt (12 rounds)
- API keys hashed with bcrypt before storage; only the `hky_` prefixed plaintext is shown once at creation
- HTTPS enforced by Coolify; HTTP requests redirect to HTTPS
- Input validated with Zod on all API routes before reaching the database
- Prisma parameterises all queries; no raw SQL in application code
- Content Security Policy headers set via Next.js config
- Audit log: every Interaction, ActionItem, Contact create/update/delete records the actor (ian or holly) and timestamp

---

## Project Structure

```
holly-prm/
  app/
    (auth)/
      login/
    (dashboard)/
      page.tsx             Dashboard
      contacts/
      settings/
    api/
      v1/                  Ian's API routes
      holly/
        v1/                Holly API routes
  components/
    ui/                    Shared UI primitives
    contacts/
    interactions/
    dashboard/
  lib/
    db.ts                  Prisma client singleton
    auth.ts                Auth.js config
    holly-auth.ts          API key middleware
    redis.ts               Redis client
  prisma/
    schema.prisma
    migrations/
  public/
    manifest.json
    sw.js
  docs/
  Dockerfile
  docker-compose.yml       Local dev
```

---

## Out of Scope for Phase 1

- Projects and Tasks UI (schema exists, no UI)
- Action item auto-extraction from interaction text
- SSE event stream for Holly
- Gmail and Google Calendar integration
- Obsidian bridge and knowledge queue UI
- Voice dictation input
- Electron desktop app
- Advanced reporting and analytics
