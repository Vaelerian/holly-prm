# Holly PRM - Phase 2 Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full PPM (personal project management) UI, action item management, and push notifications for follow-up reminders and overdue contact alerts.

**Architecture:** Builds directly on Phase 1. One new DB table (PushSubscription). Adds three new pages (`/projects`, `/projects/[id]`, `/tasks`), enhances the dashboard, and adds a push notification system with a cron endpoint triggered by Coolify.

**Tech Stack:** Next.js 16 App Router, Prisma 7, `web-push` npm package for VAPID push, existing Redis/Postgres infrastructure.

---

## Scope

Phase 2 delivers:

1. **Projects UI** -- list, create, view, edit, delete projects
2. **Tasks UI** -- per-project tasks and a cross-project all-tasks board
3. **Action items UI** -- create/complete action items from interactions, tasks, and the dashboard
4. **Dashboard enhancements** -- action items section, milestones section, two new stats
5. **Push notifications** -- browser push for overdue contacts and pending follow-ups via a cron endpoint

---

## New Routes

```
/projects                   Project list
/projects/new               Create project form
/projects/[id]              Project detail (tasks, milestones, action items)
/projects/[id]/edit         Edit project form
/tasks                      All-tasks board (cross-project, filterable)

/api/v1/projects            GET list, POST create
/api/v1/projects/[id]       GET, PUT, DELETE
/api/v1/tasks               GET list (accepts ?projectId filter), POST create
/api/v1/tasks/[id]          GET, PUT, DELETE
/api/v1/push/subscribe      POST -- save push subscription
/api/v1/push/unsubscribe    DELETE -- remove push subscription
/api/v1/cron/notify         POST -- send due notifications (cron-secret protected)
```

---

## Database Changes

One new table. No changes to existing tables.

### PushSubscription

Stores browser Web Push subscriptions per device.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| endpoint | String | Unique push endpoint URL |
| p256dh | String | Public key |
| auth | String | Auth secret |
| createdAt | DateTime | |

Add to `prisma/schema.prisma` and generate a new migration.

---

## New Environment Variables

| Variable | Purpose |
|----------|---------|
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |
| `VAPID_EMAIL` | Contact email for VAPID (e.g. `mailto:ian@example.com`) |
| `CRON_SECRET` | Shared secret to protect `/api/v1/cron/notify` |

Generate VAPID keys once with:
```bash
npx web-push generate-vapid-keys
```

---

## Projects UI

### `/projects` -- Project list

- Grid of project cards, each showing: title, category badge, status badge, priority badge, target date (if set), task progress bar (e.g. "3 / 7 done")
- Filter bar: status dropdown (all / planning / active / on-hold / done / cancelled)
- "+ New project" button links to `/projects/new`
- Clicking a card navigates to `/projects/[id]`
- Empty state: "No projects yet. Create your first project."

### `/projects/new` and `/projects/[id]/edit`

Form fields: title (required), description, category (personal/work/volunteer), status, priority, target date, notes. Uses react-hook-form + Zod validation matching the existing contact form pattern.

### `/projects/[id]` -- Project detail

Three sections:

1. **Header** -- title, category/status/priority badges, target date, edit button, delete button (with confirmation)
2. **Milestones** -- tasks where `isMilestone=true`, shown as a timeline row with status indicators
3. **Tasks** -- full task list for this project. Each row shows: title, status toggle (click to cycle todo → in-progress → done), priority badge, assignee badge (ian/holly), due date. "+ Add task" inline form at the bottom.
4. **Action items** -- action items linked to tasks within this project. Shows title, status, assignee, due date.

---

## Tasks UI

### `/tasks` -- All-tasks board

- Flat list of all tasks across all projects
- Grouped by project (collapsible sections)
- Filter bar: status (all/todo/in-progress/done), assignee (all/ian/holly), milestone only toggle
- Each task row: project name (link), task title, status badge, priority, due date
- Milestones visually distinct (bold title, milestone icon)
- No create from this view -- tasks are created within a project

---

## Action Items

Action items already exist in the DB and API (Phase 1). Phase 2 adds UI in three places:

### On interaction detail (`/contacts/[id]`)

Already shows action items read-only. Phase 2 adds:
- "Mark done" button per item (PATCH status=done)
- "+ Add action item" inline form: title, priority, assignee, due date

### On project detail (`/projects/[id]`)

As described above -- action items linked to tasks in the project.

### On dashboard

New "Action items" section below the existing sections:
- Shows Ian's open action items (assignedTo=ian, status=todo or in-progress)
- Each row: title, parent link (interaction or task), due date, "Mark done" button
- Capped at 10 items, "View all" link (no separate all-action-items page in Phase 2)

---

## Dashboard Enhancements

### Stats row -- two new stats

Add to the existing `StatsRow` component:
- Open projects count (status = planning or active)
- Tasks due today count (dueDate = today, status != done/cancelled)

### New sections

Below existing sections, add in order:
1. **Upcoming milestones** -- next 3 milestones by due date (isMilestone=true, status != done, dueDate not null)
2. **My action items** -- as described above

---

## Push Notifications

### Setup flow (Settings page)

Add a "Notifications" card to `/settings`:
- Shows current subscription status (enabled/disabled)
- "Enable notifications" button -- requests browser permission, creates push subscription, POSTs to `/api/v1/push/subscribe`
- "Disable notifications" button -- calls DELETE `/api/v1/push/unsubscribe`, removes from DB

### Notification triggers

The cron endpoint (`POST /api/v1/cron/notify`, protected by `Authorization: Bearer <CRON_SECRET>`) runs every 15 minutes via Coolify's scheduler. It sends push notifications for:

1. **Overdue contacts** -- contacts where `interactionFreqDays` is set and `healthScore < 100`. One notification per overdue contact, max 5 per cron run to avoid spam. Message: "Catch up with [name] -- it's been a while."

2. **Follow-ups due** -- interactions where `followUpRequired=true`, `followUpCompleted=false`, and `followUpDate` is today or in the past. One notification per follow-up. Message: "Follow up with [contact name]: [summary truncated to 60 chars]."

Deduplication: store a Redis key `notify:sent:[type]:[id]:[date]` with 24-hour TTL so the same item doesn't trigger multiple notifications per day.

### Service worker push handler

Add to the existing service worker (`public/sw.js`):
```js
self.addEventListener('push', event => {
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      data: { url: data.url }
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
```

### New library

Install `web-push` npm package. Create `lib/push.ts` singleton that initialises VAPID keys from env vars and exports a `sendPushNotification(subscription, payload)` helper.

---

## New Files

```
app/(dashboard)/projects/page.tsx
app/(dashboard)/projects/new/page.tsx
app/(dashboard)/projects/[id]/page.tsx
app/(dashboard)/projects/[id]/edit/page.tsx
app/(dashboard)/tasks/page.tsx
app/api/v1/projects/route.ts
app/api/v1/projects/[id]/route.ts
app/api/v1/tasks/route.ts
app/api/v1/tasks/[id]/route.ts
app/api/v1/push/subscribe/route.ts
app/api/v1/push/unsubscribe/route.ts
app/api/v1/cron/notify/route.ts
components/projects/project-card.tsx
components/projects/project-form.tsx
components/tasks/task-row.tsx
components/action-items/action-item-row.tsx
lib/push.ts
lib/services/projects.ts
lib/services/tasks.ts
lib/validations/project.ts
lib/validations/task.ts
prisma/migrations/20260410000001_push_subscription/migration.sql
```

## Modified Files

```
app/(dashboard)/contacts/[id]/page.tsx     add action item create/complete UI
app/(dashboard)/settings/page.tsx          add notifications card
app/page.tsx                               stays as redirect to /contacts
components/dashboard/stats-row.tsx         add two new stat props
app/(dashboard)/page.tsx  (recreate)       add milestones + action items sections
lib/services/briefing.ts                   add milestones + action items queries
prisma/schema.prisma                       add PushSubscription model
public/sw.js                               add push event handlers
```

---

## Validation Schemas

### CreateProjectSchema
```ts
z.object({
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  category: z.enum(["personal", "work", "volunteer"]),
  status: z.enum(["planning", "active", "on_hold", "done", "cancelled"]).default("planning"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  targetDate: z.string().datetime().nullable().default(null),
  notes: z.string().default(""),
})
```

### CreateTaskSchema
```ts
z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).default("todo"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedTo: z.enum(["ian", "holly"]),
  dueDate: z.string().datetime().nullable().default(null),
  isMilestone: z.boolean().default(false),
})
```

---

## Error Handling

- All new API routes follow the existing pattern: Zod validation returning 422, auth check returning 401, errors returning `{ error: "message" }` JSON
- Cron endpoint returns 401 if `Authorization` header doesn't match `CRON_SECRET`
- Push send failures are caught and logged but do not fail the cron run
- If `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` are not set, the push subscribe endpoint returns 503 with `{ error: "Push notifications not configured" }`

---

## Out of Scope for Phase 2

- Holly API endpoints for projects/tasks (Phase 3)
- SSE event stream (Phase 3)
- Gmail / Google Calendar integration (Phase 4)
- Knowledge queue UI (Phase 5)
