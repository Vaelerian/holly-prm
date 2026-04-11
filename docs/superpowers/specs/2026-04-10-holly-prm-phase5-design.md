# Holly PRM - Phase 5 Design Spec

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Phase 5 - Obsidian Bridge

---

## Overview

Phase 5 adds a bidirectional Obsidian bridge. The vault lives on the same VPS as Holly, accessible as a local filesystem path. The bridge lets Holly search and read notes from the vault for context, and create or update notes in the vault from PRM data. A configurable sync schedule (separate cadences for work days and weekends) keeps linked notes up to date automatically. On-demand sync is also available.

---

## Pillars

1. **Vault Reader** - filesystem-based search and note retrieval exposed via Holly API
2. **Note Writer** - create notes in `Holly/` folder, update notes anywhere in the vault, frontmatter tracks PRM entity linkage
3. **Sync Service** - scheduled sync wired into existing cron infrastructure, on-demand sync endpoint
4. **Config and Settings UI** - `VaultConfig` table, Settings page section for vault path and sync schedule

---

## Schema Changes

Two new tables. No changes to existing tables.

### VaultConfig

Stores the vault connection and schedule. At most one row exists (single-user app).

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| vaultPath | String | Absolute path to vault root on VPS |
| workdayCron | String | Cron for Mon-Fri, default `0 * * * 1-5` (hourly) |
| weekendCron | String | Cron for Sat-Sun, default `0 */4 * * 0,6` (every 4 hours) |
| lastSyncAt | DateTime? | Null until first sync completes |
| enabled | Boolean | Default true. Set false to pause sync without deleting config |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### VaultNote

Tracks which PRM entities have linked vault notes. Allows the sync service to check only known-linked notes rather than scanning all frontmatter on every run.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| entityType | String | `contact`, `project`, `interaction` |
| entityId | String | UUID of the PRM entity |
| vaultPath | String | Relative path from vault root |
| lastSyncAt | DateTime | When this note was last synced |
| createdAt | DateTime | |

@@unique([entityType, entityId])

### Migrations

```sql
-- VaultConfig
CREATE TABLE "VaultConfig" (
    "id" TEXT NOT NULL,
    "vaultPath" TEXT NOT NULL,
    "workdayCron" TEXT NOT NULL DEFAULT '0 * * * 1-5',
    "weekendCron" TEXT NOT NULL DEFAULT '0 */4 * * 0,6',
    "lastSyncAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VaultConfig_pkey" PRIMARY KEY ("id")
);

-- VaultNote
CREATE TABLE "VaultNote" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "vaultPath" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultNote_entityType_entityId_key" ON "VaultNote"("entityType", "entityId");
```

---

## Vault Reader

### `lib/services/vault.ts`

All filesystem operations live here. The vault root path comes from `VaultConfig`. All paths are validated to stay within the vault root (path traversal prevention).

```ts
searchVault(query: string, limit?: number): Promise<VaultSearchResult[]>
getNoteContent(relativePath: string): Promise<string | null>
getVaultConfig(): Promise<VaultConfig | null>
isVaultAccessible(): Promise<boolean>
```

**`searchVault`**
- Reads `VaultConfig`. Returns `[]` if not configured or vault not accessible.
- Uses Node.js `fs` + recursive directory walk to find all `.md` files.
- Greps each file for the query string (case-insensitive).
- Returns up to `limit` (default 10) results: `{ path, title, snippet, frontmatter }`.
- Title is extracted from the first H1 heading, or filename if no H1.
- Snippet is up to 200 characters of context around the match.
- Frontmatter is parsed from YAML between `---` delimiters if present.

**`getNoteContent`**
- Validates path stays within vault root.
- Returns full file content as string, or null if not found.

### Holly API Routes

```
GET  /api/holly/v1/vault/search?q=<query>&limit=<n>
GET  /api/holly/v1/vault/note?path=<encoded-relative-path>
```

Both require `X-Holly-API-Key`. Both return `{ error: "vault_not_configured" }` with 503 if vault path is not set or not accessible.

**Search response:**
```json
{
  "results": [
    {
      "path": "People/John Smith.md",
      "title": "John Smith",
      "snippet": "...discussed the Walker project in detail...",
      "frontmatter": { "prm_entity": "contact", "prm_id": "uuid" }
    }
  ],
  "query": "Walker project",
  "total": 3
}
```

**Get note response:**
```json
{
  "path": "People/John Smith.md",
  "content": "# John Smith\n\n..."
}
```

---

## Note Writer

### `lib/services/vault.ts` (continued)

```ts
createNote(filename: string, entityType: string, entityId: string, content: string): Promise<string>
updateNote(relativePath: string, content: string): Promise<void>
```

**`createNote`**
- Validates filename (alphanumeric, spaces, hyphens, underscores only - no path separators).
- Creates file at `Holly/<filename>.md` (creates `Holly/` directory if missing).
- Prepends frontmatter:
  ```yaml
  ---
  prm_entity: contact
  prm_id: <uuid>
  created: 2026-04-10
  ---
  ```
- Inserts a `VaultNote` row pointing to the new file.
- Returns the relative path of the created note.
- Throws if file already exists (caller should use updateNote instead).

**`updateNote`**
- Validates path stays within vault root.
- Reads existing file, preserves frontmatter block, replaces body content.
- Adds or updates `last_updated` field in frontmatter.
- Updates `VaultNote.lastSyncAt` if a matching row exists.

### Holly API Routes

```
POST  /api/holly/v1/vault/note      Create a note
PATCH /api/holly/v1/vault/note      Update a note
```

Both require `X-Holly-API-Key`.

**Create request body:**
```json
{
  "filename": "John Smith",
  "entityType": "contact",
  "entityId": "uuid",
  "content": "# John Smith\n\nJohn is the CTO at Acme..."
}
```

**Update request body:**
```json
{
  "path": "Holly/John Smith.md",
  "content": "# John Smith\n\nUpdated narrative..."
}
```

Holly generates the `content` narrative using its own AI reasoning before calling these endpoints. The PRM does not call the AI - it only stores and retrieves.

---

## Sync Service

### `lib/services/vault-sync.ts`

```ts
runVaultSync(): Promise<VaultSyncResult>
shouldRunSync(config: VaultConfig): boolean
```

**`shouldRunSync`**
- Checks `config.enabled`. Returns false if disabled.
- Determines if current time is a workday (Mon-Fri) or weekend (Sat-Sun).
- Parses the appropriate cron expression and checks if the sync is due based on `lastSyncAt`.
- Uses a simple cron-next-run calculation (no external cron library - the allowed values are constrained to the UI dropdowns).

**`runVaultSync`**
1. Loads all `VaultNote` rows.
2. For each linked note: reads the file, checks `last_updated` frontmatter vs `VaultNote.lastSyncAt`.
3. If the file has been modified since last sync: includes it in the result as a "vault update" for Holly to process.
4. Updates `VaultConfig.lastSyncAt` on completion.
5. Returns `{ updatedNotes: VaultSearchResult[], errors: string[] }`.

The sync service **does not auto-create or auto-update PRM records**. It surfaces changed notes as data for Holly to reason about. Holly decides what action to take.

### Cron Integration

In `app/api/v1/cron/notify/route.ts`, add a vault sync step after the Gmail poll:

```ts
// 4. Vault sync
try {
  const config = await getVaultConfig()
  if (config && shouldRunSync(config)) {
    const result = await runVaultSync()
    await redis.set("vault:sync:latest", JSON.stringify(result), "EX", 7200)
  }
} catch (e) {
  console.error("[cron/notify] vault sync failed", e)
}
```

Results are cached in Redis under `vault:sync:latest` (TTL 2 hours) for inclusion in the next briefing.

### Briefing Extension

`getBriefing()` gains a `vaultUpdates` field - reads from Redis key `vault:sync:latest`. Empty array if key absent or vault not configured.

### On-Demand Sync

```
POST /api/holly/v1/vault/sync
```

Requires `X-Holly-API-Key`. Calls `runVaultSync()` directly, bypassing the schedule check. Returns the sync result.

---

## Config and Settings UI

### Settings Page

A new "Obsidian Vault" section in `app/(dashboard)/settings/page.tsx`:

- **Vault path** - text input for the absolute path, with a "Test connection" button that calls `GET /api/v1/vault/status` and shows accessible/not found.
- **Sync schedule** - two dropdowns (Work days, Weekends) with friendly options:
  - Every hour
  - Every 2 hours
  - Every 4 hours
  - Twice daily (9am and 5pm)
  - Once daily (9am)
- **Enabled** toggle
- **Last synced** - read-only timestamp, shows "Never" if null
- **Sync now** button - calls `POST /api/v1/vault/sync` (the web session version, not the Holly API version)

### New API Routes (web session)

```
GET   /api/v1/vault/status          Check vault accessibility
POST  /api/v1/vault/config          Save VaultConfig (path, schedules, enabled)
POST  /api/v1/vault/sync            Trigger on-demand sync from UI
```

All require active session (existing auth middleware).

---

## New Routes Summary

```
GET   /api/holly/v1/vault/search    Search vault (Holly)
GET   /api/holly/v1/vault/note      Get note content (Holly)
POST  /api/holly/v1/vault/note      Create note (Holly)
PATCH /api/holly/v1/vault/note      Update note (Holly)
POST  /api/holly/v1/vault/sync      On-demand sync (Holly)
GET   /api/v1/vault/status          Vault accessibility check (web)
POST  /api/v1/vault/config          Save config (web)
POST  /api/v1/vault/sync            On-demand sync (web)
```

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `VaultConfig` not set | All vault operations return `{ error: "vault_not_configured" }` with 503 |
| Vault path does not exist or not readable | Same as not configured - 503 |
| Note not found on read/update | 404, no crash |
| Path traversal attempt | 400, request rejected |
| Filename invalid characters on create | 422 with validation error |
| File already exists on create | 409, Holly should use PATCH instead |
| Sync failure | Logged, `lastSyncAt` not updated, next scheduled run retries |
| Redis unavailable for sync cache | Logged, vault sync result not cached - next briefing gets empty `vaultUpdates` |

---

## Security

- All file paths are resolved with `path.resolve()` and checked to start with the configured vault root before any read or write operation.
- Filenames for new notes are validated against an allowlist pattern before use.
- The vault root itself is set by the authenticated user in Settings - it is never derived from request input.
- Holly API routes require `X-Holly-API-Key` (existing middleware).
- Web routes require active session (existing middleware).

---

## Out of Scope for Phase 5

- Real-time vault watching (inotify / chokidar) - scheduled sync is sufficient
- Obsidian plugin integration (Dataview queries, Templater templates)
- Syncing to/from Obsidian Sync or cloud-hosted vaults
- Multi-vault support
- Note deletion via API
- Multi-user (Phase 6)
