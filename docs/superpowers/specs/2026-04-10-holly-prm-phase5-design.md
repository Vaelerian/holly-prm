# Holly PRM - Phase 5 Design Spec

**Date:** 2026-04-10 (revised 2026-04-12)
**Status:** Approved
**Scope:** Phase 5 - Obsidian Bridge

---

## Overview

Phase 5 adds a bidirectional Obsidian vault bridge. The vault is stored in a self-hosted CouchDB instance (running on the same VPS as Holly) via the Obsidian LiveSync community plugin. Holly connects to CouchDB directly over the internal network, decrypts note content using the LiveSync E2E passphrase, and can create or update notes in the vault (encrypted and written back to CouchDB in LiveSync-compatible format). A configurable sync schedule (separate cadences for work days and weekends) keeps linked notes up to date automatically. On-demand sync is also available.

**CouchDB is on the same VPS.** Holly connects via `http://localhost:5984`, not through the public `https://sync.vaelerian.uk` endpoint. This avoids an unnecessary round-trip through Cloudflare.

**E2E encryption is enabled.** All vault data in CouchDB is encrypted with AES-GCM using a passphrase-derived key. Holly must decrypt documents to read them and encrypt content before writing. This uses Node.js's built-in `crypto.subtle` (WebCrypto API).

---

## Pillars

1. **CouchDB Client** - HTTP wrapper around CouchDB's REST API, internal only
2. **Crypto Layer** - AES-GCM encrypt/decrypt matching LiveSync's format, passphrase-derived key via PBKDF2
3. **Vault Reader** - search and note retrieval via CouchDB queries + decryption, exposed via Holly API
4. **Note Writer** - create/update notes in CouchDB (encrypted), track linkage in VaultNote table
5. **Sync Service** - CouchDB `_changes` feed for change detection, cron-driven, on-demand endpoint
6. **Config and Settings UI** - `VaultConfig` table, Settings page section for connection details and sync schedule

---

## Schema Changes

Two new tables. No changes to existing tables.

### VaultConfig

Stores the CouchDB connection details and sync schedule. At most one row exists.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| couchDbUrl | String | CouchDB URL, default `http://localhost:5984` |
| couchDbDatabase | String | Database name, default `obsidian` |
| couchDbUsername | String | CouchDB username |
| couchDbPassword | String | CouchDB password (stored in DB for settings manageability) |
| e2ePassphrase | String | LiveSync E2E passphrase for decrypt/encrypt |
| workdayCron | String | Cron for Mon-Fri, default `0 * * * 1-5` (hourly) |
| weekendCron | String | Cron for Sat-Sun, default `0 */4 * * 0,6` (every 4 hours) |
| lastSyncAt | DateTime? | Null until first sync completes |
| lastSeq | String | CouchDB changes feed sequence, default `"0"` |
| enabled | Boolean | Default true |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### VaultNote

Tracks which PRM entities have linked vault notes. Stores both the CouchDB document ID (encrypted path, used for API calls) and the decrypted note path (for display).

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| entityType | String | `contact`, `project`, `interaction` |
| entityId | String | UUID of the PRM entity |
| couchDbId | String | Document `_id` in CouchDB (encrypted path) |
| notePath | String | Decrypted relative path (for display) |
| lastSyncAt | DateTime | When this note was last synced |
| createdAt | DateTime | |

@@unique([entityType, entityId])

### Migrations

```sql
-- VaultConfig
CREATE TABLE "VaultConfig" (
    "id" TEXT NOT NULL,
    "couchDbUrl" TEXT NOT NULL DEFAULT 'http://localhost:5984',
    "couchDbDatabase" TEXT NOT NULL DEFAULT 'obsidian',
    "couchDbUsername" TEXT NOT NULL,
    "couchDbPassword" TEXT NOT NULL,
    "e2ePassphrase" TEXT NOT NULL,
    "workdayCron" TEXT NOT NULL DEFAULT '0 * * * 1-5',
    "weekendCron" TEXT NOT NULL DEFAULT '0 */4 * * 0,6',
    "lastSyncAt" TIMESTAMP(3),
    "lastSeq" TEXT NOT NULL DEFAULT '0',
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
    "couchDbId" TEXT NOT NULL,
    "notePath" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VaultNote_entityType_entityId_key" ON "VaultNote"("entityType", "entityId");
```

---

## CouchDB Client

### `lib/services/vault-couch.ts`

Thin HTTP wrapper around CouchDB's REST API. All calls use the credentials from `VaultConfig`. Does not do any encryption - that is the crypto layer's responsibility.

```ts
couchGet(config: VaultConfig, path: string): Promise<unknown>
couchPut(config: VaultConfig, path: string, body: unknown): Promise<unknown>
couchAllDocs(config: VaultConfig, options?: { include_docs?: boolean }): Promise<CouchAllDocsResult>
couchChanges(config: VaultConfig, since: string): Promise<CouchChangesResult>
couchDbAccessible(config: VaultConfig): Promise<boolean>
```

All functions accept `VaultConfig` directly (no global state). Auth is HTTP Basic using `couchDbUsername` and `couchDbPassword`.

`couchDbAccessible` calls `GET /{database}` and returns `true` on 200, `false` on any error.

---

## Crypto Layer

### `lib/services/vault-crypto.ts`

Implements AES-GCM encrypt/decrypt matching LiveSync's E2E format, using Node.js `crypto.subtle` (WebCrypto API, available in Node 18+). The passphrase comes from `VaultConfig.e2ePassphrase`.

```ts
deriveKey(passphrase: string): Promise<CryptoKey>
encryptString(key: CryptoKey, plaintext: string): Promise<string>
decryptString(key: CryptoKey, ciphertext: string): Promise<string>
```

**Key derivation:**
- PBKDF2 with SHA-256, 100,000 iterations
- Salt: `new TextEncoder().encode(passphrase)` (LiveSync derives salt from passphrase itself)
- Output: AES-GCM 256-bit key

**Encryption output format:** `base64(iv[12 bytes] + ciphertext + auth_tag[16 bytes])`

**Note on format verification:** The exact binary layout of LiveSync's encrypted documents must be confirmed by inspecting a live document from the CouchDB instance before implementation. Task 2 in the implementation plan is a discovery step that fetches a raw document and reverse-engineers the format. The above describes the expected format based on LiveSync's source; if it differs, the crypto layer is updated before Tasks 3-10 proceed.

---

## Vault Reader

### `lib/services/vault.ts`

Reads vault notes via CouchDB. Decrypts document IDs and content using the crypto layer.

```ts
getVaultConfig(): Promise<VaultConfig | null>
isVaultAccessible(): Promise<boolean>
searchVault(query: string, limit?: number): Promise<VaultSearchResult[]>
getNoteContent(couchDbId: string): Promise<string | null>
```

**`searchVault`:**
- Loads `VaultConfig`. Returns `[]` if not configured or inaccessible.
- Calls `couchAllDocs` with `include_docs: true` to fetch all documents.
- For each document: decrypts the `_id` to get the file path; skips documents where decryption fails (non-note documents). Decrypts the `data` field to get the content.
- Filters to documents whose decrypted path ends in `.md` and whose decrypted content contains the query string (case-insensitive).
- Returns up to `limit` (default 10) results: `{ couchDbId, path, title, snippet, frontmatter }`.
- Title: first H1 heading from decrypted content, or filename if no H1.
- Snippet: up to 200 characters of context around the first match.
- Frontmatter: parsed from YAML between `---` delimiters in decrypted content.

**`getNoteContent`:**
- Calls `couchGet` for the document by `couchDbId`.
- Decrypts the `data` field and returns the plaintext, or null if the document does not exist.

### Holly API Routes

```
GET  /api/holly/v1/vault/search?q=<query>&limit=<n>
GET  /api/holly/v1/vault/note?id=<couchDbId>
```

Both require `X-Holly-API-Key`. Return `{ error: "vault_not_configured" }` with 503 if config is absent or inaccessible.

**Search response:**
```json
{
  "results": [
    {
      "couchDbId": "encryptedDocId",
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
  "couchDbId": "encryptedDocId",
  "path": "People/John Smith.md",
  "content": "# John Smith\n\n..."
}
```

---

## Note Writer

### `lib/services/vault.ts` (continued)

```ts
createNote(notePath: string, entityType: string, entityId: string, content: string): Promise<string>
updateNote(couchDbId: string, content: string): Promise<void>
```

**`createNote`:**
- Validates `notePath`: alphanumeric, spaces, hyphens, underscores, forward slashes only. Must end in `.md`.
- Prepends frontmatter to content:
  ```yaml
  ---
  prm_entity: contact
  prm_id: <uuid>
  created: 2026-04-10
  ---
  ```
- Encrypts `notePath` to produce `couchDbId`.
- Encrypts the full content (with frontmatter).
- Constructs a LiveSync-compatible document: `{ _id: couchDbId, data: encryptedContent, type: "newnote", mtime: Date.now(), ctime: Date.now(), size: byteLength, encrypted: true }`.
- `couchPut`s the document. Returns 409 if already exists.
- Inserts a `VaultNote` row linking the entity to the note.
- Returns `couchDbId`.

**`updateNote`:**
- Fetches the existing document to get `_rev` (required for CouchDB updates).
- Decrypts the existing content, preserves the frontmatter block, replaces the body.
- Adds or updates `last_updated` field in frontmatter.
- Encrypts the updated content.
- `couchPut`s the document with the existing `_rev`.
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
  "notePath": "Holly/John Smith.md",
  "entityType": "contact",
  "entityId": "uuid",
  "content": "# John Smith\n\nJohn is the CTO at Acme..."
}
```

**Update request body:**
```json
{
  "couchDbId": "encryptedDocId",
  "content": "# John Smith\n\nUpdated narrative..."
}
```

Holly generates the `content` narrative using its own AI reasoning before calling these endpoints.

---

## Sync Service

### `lib/services/vault-sync.ts`

```ts
runVaultSync(): Promise<VaultSyncResult>
shouldRunSync(config: VaultConfig): boolean
```

**`runVaultSync`:**
1. Loads `VaultConfig`. Returns early if disabled or inaccessible.
2. Calls `couchChanges(config, config.lastSeq)` to get all documents changed since the last sync.
3. For each changed document: decrypts the `_id` to get the path. If decryption fails, skip (not a LiveSync note document). Decrypts the `data` field to get the content.
4. Cross-references changed document IDs against `VaultNote` rows to identify which PRM entities are affected.
5. Returns `{ updatedNotes: VaultSearchResult[], errors: string[] }`.
6. Updates `VaultConfig.lastSyncAt` and `VaultConfig.lastSeq` to the new sequence value from the changes feed.

The sync service does not auto-create or auto-update PRM records. It surfaces changed notes as data for Holly to reason about.

**`shouldRunSync`:**
- Returns `false` if `config.enabled` is false.
- Checks if current time is a workday or weekend.
- Parses the appropriate cron expression and checks if sync is due based on `lastSyncAt`.
- No external cron library: allowed values are constrained to UI dropdowns.

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

Requires `X-Holly-API-Key`. Calls `runVaultSync()` directly, bypassing the schedule check.

---

## Config and Settings UI

### Settings Page

A new "Obsidian Vault" section in `app/(dashboard)/settings/page.tsx`:

- **CouchDB URL** - text input, default `http://localhost:5984`
- **Database name** - text input, default `obsidian`
- **Username** - text input
- **Password** - password input (masked, write-only: shows placeholder if set)
- **E2E passphrase** - password input (masked, write-only)
- **Test connection** button - calls `GET /api/v1/vault/status`
- **Sync schedule** - two dropdowns (Work days, Weekends) with friendly options:
  - Every hour
  - Every 2 hours
  - Every 4 hours
  - Twice daily (9am and 5pm)
  - Once daily (9am)
- **Enabled** toggle
- **Last synced** - read-only timestamp, shows "Never" if null
- **Sync now** button - calls `POST /api/v1/vault/sync`

### New API Routes (web session)

```
GET   /api/v1/vault/status          Check CouchDB accessibility + return non-secret config
POST  /api/v1/vault/config          Save VaultConfig (all fields)
POST  /api/v1/vault/sync            Trigger on-demand sync from UI
```

`GET /api/v1/vault/status` returns:
```json
{
  "configured": true,
  "accessible": true,
  "couchDbUrl": "http://localhost:5984",
  "couchDbDatabase": "obsidian",
  "couchDbUsername": "vaelerian",
  "passwordSet": true,
  "e2ePassphraseSet": true,
  "lastSyncAt": "2026-04-12T10:00:00Z",
  "lastSeq": "42-abc",
  "enabled": true,
  "workdayCron": "0 * * * 1-5",
  "weekendCron": "0 */4 * * 0,6"
}
```

Password and passphrase are never returned. `passwordSet` and `e2ePassphraseSet` are boolean flags only.

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
| CouchDB unreachable | Same as not configured - 503 |
| Decryption fails for a document | Document is silently skipped (not a LiveSync note, or corrupted) |
| Document not found on read/update | 404 |
| Invalid `notePath` characters on create | 422 |
| Document already exists on create | 409 |
| Wrong `_rev` on update (CouchDB conflict) | 409, Holly should re-fetch and retry |
| Sync failure | Logged, `lastSyncAt` and `lastSeq` not updated, next run retries |
| Redis unavailable | Logged, sync result not cached - next briefing gets empty `vaultUpdates` |

---

## Security

- CouchDB is accessed via `http://localhost:5984` (internal only, not the public Cloudflare endpoint). No traffic leaves the VPS.
- Credentials (`couchDbPassword`, `e2ePassphrase`) are stored in the `VaultConfig` database table. This is an accepted trade-off for a self-hosted single-user app where the settings UI needs to manage them. They are never returned in API responses.
- Holly API routes require `X-Holly-API-Key`.
- Web session routes require active session.
- Note paths are validated against an allowlist pattern before encryption and write.

---

## Out of Scope for Phase 5

- CouchDB document ID format: the exact encrypted `_id` format is confirmed during implementation (Task 2 discovery step) before any read or write code is finalised
- Real-time vault watching (CouchDB `_changes` long-poll or feed) - scheduled sync is sufficient
- Multi-vault support
- Note deletion via API
- Multi-user vault routing (Phase 6)
