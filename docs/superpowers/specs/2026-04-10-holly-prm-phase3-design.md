# Holly PRM - Phase 3 Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Phase 3 - Holly API Extended + AI Data Layer + Reporting

---

## Overview

Phase 3 extends the Holly API with project/task management endpoints, a real-time SSE event stream, and richer data for AI reasoning. It adds a reporting UI to the PRM dashboard and exposes the same analytical data via API for Holly. All AI reasoning remains Holly-side; the PRM provides structured, high-signal data.

---

## Pillars

1. **Holly API Extended** - project/task CRUD, enriched briefing, SSE event stream, transcript field on interactions
2. **AI Data Layer** - analytics endpoints giving Holly the raw data to generate follow-up suggestions, health trend observations, and velocity assessments
3. **Reporting UI** - in-app reporting dashboard for Ian, built on the same service functions the API uses

---

## Schema Changes

One field addition to `Interaction`. No new tables.

### Interaction
Add `transcript: String?` (optional Text field) - stores raw conversation text Holly can pass alongside the summary when logging an interaction.

Migration: `ALTER TABLE "Interaction" ADD COLUMN "transcript" TEXT;`

---

## New Routes

### Holly API Extensions

```
GET  /api/holly/v1/stream                    SSE key event stream
GET  /api/holly/v1/projects                  List projects (?status=, ?category=)
POST /api/holly/v1/projects                  Create project
GET  /api/holly/v1/projects/:id              Project detail with tasks and milestones
PATCH /api/holly/v1/projects/:id             Update project status/fields
GET  /api/holly/v1/tasks                     List tasks (?projectId=, ?assignedTo=, ?status=, ?milestoneOnly=)
POST /api/holly/v1/tasks                     Create task
PATCH /api/holly/v1/tasks/:id               Update task status/fields
GET  /api/holly/v1/analytics/health          Contact health trends
GET  /api/holly/v1/analytics/velocity        Project velocity
GET  /api/holly/v1/analytics/completion      Action item completion rates
```

### Ian's Web API Extensions

```
GET  /api/v1/analytics/health                Contact health trends (session auth)
GET  /api/v1/analytics/velocity              Project velocity (session auth)
GET  /api/v1/analytics/completion            Action item completion rates (session auth)
```

### New UI Route

```
/reports                                     Reporting dashboard (server component)
```

---

## SSE Event Stream

### Endpoint

`GET /api/holly/v1/stream`

Holly connects and holds the connection open. The server responds with `Content-Type: text/event-stream` and sends events as they occur.

### Transport

Events are published via Redis pub/sub. Prisma middleware publishes to a Redis channel (`holly:events`) when relevant creates/updates occur. The SSE route handler subscribes to the channel and forwards events to the connected client.

This avoids database polling. The SSE route itself makes no database queries after the initial connection.

### Event Types

| Event | Trigger | Payload |
|-------|---------|---------|
| `interaction.created` | New interaction logged | `{ contactId, contactName, type, summary, createdByHolly }` |
| `action_item.created` | New action item created | `{ id, title, assignedTo, priority, dueDate }` |
| `action_item.completed` | Action item marked done | `{ id, title, assignedTo }` |
| `contact.overdue` | Health score drops below 40 | `{ id, name, healthScore, daysSinceLastInteraction }` |

### Event Shape

```json
{
  "type": "interaction.created",
  "payload": { ... },
  "timestamp": "2026-04-10T08:00:00Z"
}
```

### Connection Handling

- Server sends a `ping` comment every 30 seconds to keep the connection alive
- On disconnect, the Redis subscription is cleaned up
- Holly should reconnect automatically on connection drop (standard SSE client behaviour)

---

## Enriched Briefing

The existing `/api/holly/v1/briefing` endpoint is extended with four additional fields:

```json
{
  "overdueContacts": [...],
  "pendingFollowUps": [...],
  "openActionItems": [...],
  "followUpCandidates": [...],
  "recentInteractions": [...],
  "upcomingMilestones": [...],
  "projectHealth": [...],
  "generatedAt": "2026-04-10T08:00:00Z"
}
```

| New Field | Description |
|-----------|-------------|
| `followUpCandidates` | Contacts at >80% of their `interactionFreqDays` - approaching overdue, not yet there. Gives Holly early signal for proactive outreach suggestions. |
| `recentInteractions` | Last 5 interactions across all contacts, including full `summary` and `transcript` text. |
| `upcomingMilestones` | Extended from 7 to 14 days. |
| `projectHealth` | Active projects with `tasksTotal`, `tasksCompleted`, percentage complete. |

---

## Interaction Create - Transcript Field

`POST /api/holly/v1/interactions` gains an optional `transcript` field:

```json
{
  "contactId": "uuid",
  "type": "call",
  "direction": "outbound",
  "summary": "Discussed the Walker project timeline.",
  "transcript": "Ian: So where are we with the Walker thing?\nHolly: ...",
  "occurredAt": "2026-04-10T09:00:00Z"
}
```

Transcript is stored as-is, no processing server-side.

---

## Project and Task Holly API Endpoints

### Projects

`GET /api/holly/v1/projects` - same filters as the web UI (`?status=active`, `?category=work`)

`GET /api/holly/v1/projects/:id` response:
```json
{
  "id": "uuid",
  "title": "...",
  "description": "...",
  "status": "active",
  "priority": "high",
  "targetDate": "2026-05-01T00:00:00Z",
  "tasksTotal": 12,
  "tasksCompleted": 4,
  "milestones": [...],
  "tasks": [...]
}
```

`POST /api/holly/v1/projects` - creates a project. Required: `title`. Optional: all other fields.

`PATCH /api/holly/v1/projects/:id` - partial update. Any subset of fields.

### Tasks

`GET /api/holly/v1/tasks` - supports `?projectId=`, `?assignedTo=ian|holly`, `?status=todo|in_progress|done|cancelled`, `?milestoneOnly=true`

`POST /api/holly/v1/tasks` - creates a task. Required: `projectId`, `title`. Optional: all other fields. Defaults: `status=todo`, `assignedTo=holly`, `isMilestone=false`.

`PATCH /api/holly/v1/tasks/:id` - partial update.

---

## Analytics Endpoints

All accept `?days=30` (default 30, max 365). Both Holly API and Ian's session API use the same underlying service functions.

### `GET /analytics/health`

Contact health trend data.

```json
{
  "window": 30,
  "contacts": [
    {
      "id": "uuid",
      "name": "John Smith",
      "currentScore": 72,
      "previousScore": 85,
      "trend": "declining",
      "daysSinceLastInteraction": 18,
      "frequencyTargetDays": 21
    }
  ]
}
```

`trend` is `improving`, `stable`, or `declining` based on comparing current score to score 30 days ago. Computed by comparing the health score as recorded in the AuditLog against the current value.

### `GET /analytics/velocity`

Project task completion rates.

```json
{
  "window": 30,
  "projects": [
    {
      "id": "uuid",
      "title": "Walker Project",
      "status": "active",
      "tasksTotal": 12,
      "tasksCompleted": 4,
      "completedInWindow": 3,
      "weeklyRate": 0.75,
      "projectedCompletionDate": "2026-06-15"
    }
  ]
}
```

`weeklyRate` = tasks completed per week within the window. `projectedCompletionDate` = null if `weeklyRate` is 0.

### `GET /analytics/completion`

Action item completion rates by assignee.

```json
{
  "window": 30,
  "rates": {
    "ian": 0.82,
    "holly": 0.91
  },
  "byWeek": [
    { "weekStart": "2026-03-17", "ian": 0.75, "holly": 1.0 },
    { "weekStart": "2026-03-24", "ian": 0.83, "holly": 0.88 }
  ]
}
```

Rate = completed / (completed + todo that have passed their due date) for the window.

---

## Reporting UI

### Route

`/reports` - server component, data fetched directly from analytics service functions.

### Navigation

Add "Reports" to sidebar and bottom nav. Bottom nav currently has 5 items (Home, Contacts, Log, Projects, Tasks). Reports replaces the least-used slot or the nav expands to 6 - to be determined during implementation based on mobile fit.

### Sections

**Relationship Health**

Table with columns: Contact | Health Score | Trend | Days Since Last | Frequency Target

- Trend shown as up/down/stable indicator (text, no icon library)
- Sorted by health score ascending (worst first)
- Contacts with no `interactionFreqDays` set are excluded (no target to trend against)

**Project Velocity**

One card per active project:
- Project name and status badge
- Progress bar: `tasksCompleted / tasksTotal`
- Weekly rate and projected completion date
- Cards sorted by projected completion date ascending (soonest first), null dates last

**Action Item Completion**

Two rows (Ian, Holly) with:
- Overall completion rate % for the last 30 days
- Week-by-week table: last 8 weeks, most recent first
- Rate displayed as percentage

**Time Window**

A `?days=30|90|365` query parameter controls the window for all three sections simultaneously. Default 30. A simple filter form at the top of the page (native select, no JS required).

### Implementation Notes

- No charting libraries - styled HTML tables, progress bars via Tailwind `w-[X%]` inline style
- All data fetched server-side, no client components needed
- Progress bars use `style={{ width: \`${pct}%\` }}` with a fixed-height container div

---

## Prisma Middleware - SSE Publishing

The existing Prisma middleware (which computes health scores and writes audit logs) gains Redis publish calls for SSE events:

- After `Interaction` create: publish `interaction.created`
- After `ActionItem` create: publish `action_item.created`
- After `ActionItem` update where `status` changed to `done`: publish `action_item.completed`
- After `Contact` update where `healthScore` drops below 40: publish `contact.overdue`

The middleware publishes to `holly:events` Redis channel. The SSE route handler subscribes on connection and unsubscribes on disconnect.

---

## Error Handling

- SSE route: on Redis subscribe failure, returns HTTP 503
- Analytics routes: if AuditLog has insufficient history (new install), returns current snapshot with `trend: "insufficient_data"`
- Holly API project/task endpoints: standard 422 for validation errors, 404 for missing records
- Transcript field: no length validation server-side (Holly controls what she sends)

---

## Security

- All new Holly API routes require `X-Holly-API-Key` (same middleware as existing routes)
- All new `/api/v1/analytics/*` routes require active session (same middleware as existing routes)
- SSE route is under `/api/holly/v1/` so API key auth applies
- Transcript content is stored as-is; it is not rendered as HTML anywhere in the UI

---

## Out of Scope for Phase 3

- Email or calendar integration (Phase 4)
- In-app calendar view (Phase 4)
- Multi-user / Holly login (Phase 6)
- Enhanced offline / background sync improvements (Phase 6)
- Knowledge queue UI (Phase 5)
- Import from other tools (Phase 6)
