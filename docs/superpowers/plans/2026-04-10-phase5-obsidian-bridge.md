# Phase 5 Obsidian Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bidirectional Obsidian vault bridge via CouchDB (self-hosted LiveSync), with E2E decryption, scheduled sync via the changes feed, and a Settings UI to configure the connection.

**Architecture:** Holly connects to CouchDB at `http://localhost:5984` (internal, same VPS). A thin HTTP client (`vault-couch.ts`) handles CouchDB REST calls. A crypto layer (`vault-crypto.ts`) implements AES-GCM encrypt/decrypt matching LiveSync's E2E format. All vault operations live in `lib/services/vault.ts`. Sync logic lives in `lib/services/vault-sync.ts`, surfacing changed notes for Holly without auto-mutating PRM records. Five Holly API routes and three web session routes expose the functionality. The cron job drives periodic sync and caches results in Redis.

**Tech Stack:** Node.js `crypto.subtle` (WebCrypto), `fetch` (Node 18+ built-in), Prisma (VaultConfig + VaultNote), Redis (vault:sync:latest TTL 7200), Next.js App Router, Zod, Tailwind CSS.

**Important:** Task 2 is a discovery step. It inspects a live CouchDB document to confirm the exact encrypted format before any read/write code is written. Tasks 3-10 depend on that confirmed format.

---

## File Map

**Create:**
- `prisma/migrations/20260410000004_phase5_vault/migration.sql` - SQL for VaultConfig and VaultNote tables
- `lib/services/vault-couch.ts` - CouchDB HTTP client (no encryption)
- `lib/services/vault-crypto.ts` - AES-GCM encrypt/decrypt (LiveSync-compatible)
- `lib/services/vault.ts` - Vault reader and writer (uses couch + crypto)
- `lib/services/vault-sync.ts` - Sync scheduling and execution
- `app/api/holly/v1/vault/search/route.ts` - Holly: search vault
- `app/api/holly/v1/vault/note/route.ts` - Holly: GET / POST / PATCH note
- `app/api/holly/v1/vault/sync/route.ts` - Holly: on-demand sync
- `app/api/v1/vault/status/route.ts` - Web: accessibility check + config fetch
- `app/api/v1/vault/config/route.ts` - Web: save config
- `app/api/v1/vault/sync/route.ts` - Web: trigger sync from UI
- `__tests__/services/vault-crypto.test.ts` - Crypto round-trip tests
- `__tests__/services/vault.test.ts` - Vault service tests (reader + writer)
- `__tests__/services/vault-sync.test.ts` - Sync service tests

**Modify:**
- `prisma/schema.prisma` - Add VaultConfig and VaultNote models
- `app/api/v1/cron/notify/route.ts` - Add vault sync step (step 4)
- `lib/services/briefing.ts` - Add vaultUpdates field from Redis
- `app/(dashboard)/settings/page.tsx` - Add Obsidian Vault section

---

### Task 1: Schema and Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260410000004_phase5_vault/migration.sql`

- [ ] **Step 1: Add VaultConfig and VaultNote models to prisma/schema.prisma**

Append to the end of `prisma/schema.prisma`:

```prisma
model VaultConfig {
  id              String    @id @default(uuid())
  couchDbUrl      String    @default("http://localhost:5984")
  couchDbDatabase String    @default("obsidian")
  couchDbUsername String
  couchDbPassword String
  e2ePassphrase   String
  workdayCron     String    @default("0 * * * 1-5")
  weekendCron     String    @default("0 */4 * * 0,6")
  lastSyncAt      DateTime?
  lastSeq         String    @default("0")
  enabled         Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model VaultNote {
  id         String   @id @default(uuid())
  entityType String
  entityId   String
  couchDbId  String
  notePath   String
  lastSyncAt DateTime
  createdAt  DateTime @default(now())

  @@unique([entityType, entityId])
}
```

- [ ] **Step 2: Create migration SQL file**

Create directory `prisma/migrations/20260410000004_phase5_vault/` and write `migration.sql`:

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

- [ ] **Step 3: Generate Prisma client**

```bash
npx prisma generate
```

Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 4: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260410000004_phase5_vault/migration.sql
git commit -m "feat: add VaultConfig and VaultNote schema for Phase 5"
```

---

### Task 2: Document Format Discovery

**Files:**
- No files created or modified. This task is research only.

This task confirms the exact binary layout of LiveSync's encrypted documents before any crypto code is written. The CouchDB instance at `http://localhost:5984` contains real encrypted data. Inspect it to confirm the format.

- [ ] **Step 1: Fetch a raw document from CouchDB**

On the VPS (or via the Holly dev environment if it has network access to the VPS):

```bash
# List all document IDs in the obsidian database
curl -s "http://vaelerian:1ndiaLima0bsCouch06042026@localhost:5984/obsidian/_all_docs?limit=5" | jq .

# Fetch one specific document (use an _id from the above output)
curl -s "http://vaelerian:1ndiaLima0bsCouch06042026@localhost:5984/obsidian/<doc_id>" | jq .
```

Record the full JSON structure of a real document. Note:
- What does `_id` look like? (is it a base64 string, a path, something else?)
- What fields are present? (`data`, `type`, `mtime`, `ctime`, `size`, `encrypted`, `children`, etc.)
- Is `data` a string or an array?
- Is there a `datatype` or `type` field that indicates encryption?

- [ ] **Step 2: Confirm the encryption format**

The expected format (based on LiveSync source) is:
- `_id`: base64-encoded AES-GCM encrypted file path
- `data`: base64-encoded AES-GCM encrypted content (format: `base64(iv[12] + ciphertext + tag[16])`)
- `type`: `"newnote"` or similar
- `encrypted`: `true`

If the actual format differs from this, document the actual format here before proceeding. The crypto layer in Task 3 must match whatever format is actually in the database.

- [ ] **Step 3: Confirm key derivation parameters**

Check the LiveSync plugin source at `https://github.com/vrtmrz/obsidian-livesync` (or the installed plugin files in the Obsidian vault) for the exact PBKDF2 parameters:
- Number of iterations (expected: 100,000)
- Salt strategy (expected: derived from passphrase, not random)
- IV length (expected: 12 bytes)

Record any differences from the expected values.

- [ ] **Step 4: Manual decryption test**

Write a one-off Node.js script (do not commit it) to verify that the known passphrase (`Wolverhampton`) can decrypt a real document fetched in Step 1:

```ts
// test-decrypt.ts (temporary, not committed)
import { webcrypto } from "node:crypto"
const { subtle } = webcrypto

async function deriveKey(passphrase: string) {
  const enc = new TextEncoder()
  const keyMaterial = await subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"])
  return subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(passphrase), iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

async function decrypt(key: CryptoKey, b64: string) {
  const buf = Buffer.from(b64, "base64")
  const iv = buf.subarray(0, 12)
  const data = buf.subarray(12)
  const plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, data)
  return new TextDecoder().decode(plain)
}

const key = await deriveKey("Wolverhampton")
const rawDoc = { data: "<paste data field here>" }
console.log(await decrypt(key, rawDoc.data))
```

Run: `npx tsx test-decrypt.ts`

Expected: readable markdown content from your vault.

If this fails, adjust the key derivation parameters based on Step 3 findings until decryption succeeds. The confirmed working parameters are what Task 3 implements.

- [ ] **Step 5: Document confirmed format**

Add a comment block at the top of `lib/services/vault-crypto.ts` (to be created in Task 3) documenting the confirmed format. No commit needed - this is carried into Task 3.

---

### Task 3: CouchDB Client

**Files:**
- Create: `lib/services/vault-couch.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/services/vault-couch.test.ts`:

```ts
import { couchGet, couchPut, couchAllDocs, couchChanges, couchDbAccessible } from "@/lib/services/vault-couch"

const fakeConfig = {
  couchDbUrl: "http://localhost:5984",
  couchDbDatabase: "obsidian",
  couchDbUsername: "vaelerian",
  couchDbPassword: "testpass",
  e2ePassphrase: "testphrase",
}

const fetchMock = jest.fn()
global.fetch = fetchMock

beforeEach(() => jest.clearAllMocks())

it("couchGet fetches with basic auth", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ _id: "doc1" }) })
  const result = await couchGet(fakeConfig as any, "/obsidian/doc1")
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:5984/obsidian/doc1",
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining("Basic ") }) })
  )
  expect(result).toEqual({ _id: "doc1" })
})

it("couchGet throws on non-ok response", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "not_found" }) })
  await expect(couchGet(fakeConfig as any, "/obsidian/missing")).rejects.toThrow()
})

it("couchDbAccessible returns true on 200", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  expect(await couchDbAccessible(fakeConfig as any)).toBe(true)
})

it("couchDbAccessible returns false on error", async () => {
  fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))
  expect(await couchDbAccessible(fakeConfig as any)).toBe(false)
})

it("couchAllDocs fetches _all_docs with include_docs", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) })
  await couchAllDocs(fakeConfig as any, { include_docs: true })
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("_all_docs"),
    expect.any(Object)
  )
})

it("couchChanges fetches _changes since lastSeq", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [], last_seq: "5-abc" }) })
  const result = await couchChanges(fakeConfig as any, "3-xyz")
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("since=3-xyz"),
    expect.any(Object)
  )
  expect(result.last_seq).toBe("5-abc")
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/services/vault-couch.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement vault-couch.ts**

Create `lib/services/vault-couch.ts`:

```ts
import type { VaultConfig } from "@/app/generated/prisma/client"

function basicAuth(username: string, password: string) {
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64")
}

function baseUrl(config: VaultConfig) {
  return `${config.couchDbUrl}/${config.couchDbDatabase}`
}

async function couchFetch(config: VaultConfig, path: string, options: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${config.couchDbUrl}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(config.couchDbUsername, config.couchDbPassword),
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`CouchDB ${res.status}: ${JSON.stringify(body)}`)
  }
  return res.json()
}

export async function couchGet(config: VaultConfig, path: string) {
  return couchFetch(config, path)
}

export async function couchPut(config: VaultConfig, path: string, body: unknown) {
  return couchFetch(config, path, { method: "PUT", body: JSON.stringify(body) })
}

export interface CouchAllDocsResult {
  rows: Array<{ id: string; key: string; value: { rev: string }; doc?: unknown }>
  total_rows: number
  offset: number
}

export async function couchAllDocs(config: VaultConfig, options: { include_docs?: boolean } = {}): Promise<CouchAllDocsResult> {
  const params = new URLSearchParams()
  if (options.include_docs) params.set("include_docs", "true")
  return couchFetch(config, `/${config.couchDbDatabase}/_all_docs?${params}`)
}

export interface CouchChangesResult {
  results: Array<{ id: string; seq: string; deleted?: boolean; doc?: unknown }>
  last_seq: string
}

export async function couchChanges(config: VaultConfig, since: string): Promise<CouchChangesResult> {
  const params = new URLSearchParams({ since, include_docs: "true" })
  return couchFetch(config, `/${config.couchDbDatabase}/_changes?${params}`)
}

export async function couchDbAccessible(config: VaultConfig): Promise<boolean> {
  try {
    await couchFetch(config, `/${config.couchDbDatabase}`)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/services/vault-couch.test.ts
```

Expected: All passing.

- [ ] **Step 5: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/services/vault-couch.ts __tests__/services/vault-couch.test.ts
git commit -m "feat: add CouchDB HTTP client for vault service"
```

---

### Task 4: Crypto Layer

**Files:**
- Create: `lib/services/vault-crypto.ts`
- Create: `__tests__/services/vault-crypto.test.ts`

Use the confirmed encryption format from Task 2. The implementation below uses the expected format; update if Task 2 found differences.

- [ ] **Step 1: Write failing tests**

Create `__tests__/services/vault-crypto.test.ts`:

```ts
import { deriveKey, encryptString, decryptString } from "@/lib/services/vault-crypto"

describe("vault-crypto", () => {
  it("deriveKey returns a CryptoKey", async () => {
    const key = await deriveKey("test-passphrase")
    expect(key).toBeDefined()
    expect(key.type).toBe("secret")
  })

  it("encrypt then decrypt round-trips correctly", async () => {
    const key = await deriveKey("test-passphrase")
    const plaintext = "# Hello\n\nThis is a test note."
    const encrypted = await encryptString(key, plaintext)
    expect(encrypted).not.toBe(plaintext)
    const decrypted = await decryptString(key, encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it("encrypting the same string twice produces different ciphertexts (random IV)", async () => {
    const key = await deriveKey("test-passphrase")
    const a = await encryptString(key, "same content")
    const b = await encryptString(key, "same content")
    expect(a).not.toBe(b)
  })

  it("decrypting with wrong key throws", async () => {
    const key1 = await deriveKey("passphrase-one")
    const key2 = await deriveKey("passphrase-two")
    const encrypted = await encryptString(key1, "secret")
    await expect(decryptString(key2, encrypted)).rejects.toThrow()
  })

  it("decrypting invalid base64 throws", async () => {
    const key = await deriveKey("test-passphrase")
    await expect(decryptString(key, "not-valid-base64!!!")).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/services/vault-crypto.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement vault-crypto.ts**

Create `lib/services/vault-crypto.ts`:

```ts
// LiveSync E2E encryption format (confirmed in Task 2 discovery):
// Key derivation: PBKDF2-SHA256, 100,000 iterations, salt = UTF-8(passphrase)
// Encryption: AES-GCM 256-bit, random 12-byte IV
// Output format: base64(iv[12 bytes] + ciphertext + auth_tag[16 bytes])
// Both document _id (file path) and data (content) use this format.

import { webcrypto } from "node:crypto"
const { subtle } = webcrypto as Crypto

export async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  )
  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(passphrase),
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  const enc = new TextEncoder()
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext))
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return Buffer.from(combined).toString("base64")
}

export async function decryptString(key: CryptoKey, b64: string): Promise<string> {
  const buf = Buffer.from(b64, "base64")
  const iv = buf.subarray(0, 12)
  const data = buf.subarray(12)
  const plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, data)
  return new TextDecoder().decode(plain)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/services/vault-crypto.test.ts
```

Expected: All passing.

- [ ] **Step 5: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/services/vault-crypto.ts __tests__/services/vault-crypto.test.ts
git commit -m "feat: add AES-GCM crypto layer matching LiveSync E2E format"
```

---

### Task 5: Vault Reader

**Files:**
- Create: `lib/services/vault.ts`
- Create: `__tests__/services/vault.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/services/vault.test.ts`:

```ts
import { getVaultConfig, isVaultAccessible, searchVault, getNoteContent } from "@/lib/services/vault"
import { prisma } from "@/lib/db"
import * as vaultCouch from "@/lib/services/vault-couch"
import * as vaultCrypto from "@/lib/services/vault-crypto"

jest.mock("@/lib/db", () => ({
  prisma: { vaultConfig: { findFirst: jest.fn() } },
}))
jest.mock("@/lib/services/vault-couch")
jest.mock("@/lib/services/vault-crypto")

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockCouch = vaultCouch as jest.Mocked<typeof vaultCouch>
const mockCrypto = vaultCrypto as jest.Mocked<typeof vaultCrypto>

const fakeConfig = {
  id: "cfg1",
  couchDbUrl: "http://localhost:5984",
  couchDbDatabase: "obsidian",
  couchDbUsername: "vaelerian",
  couchDbPassword: "pass",
  e2ePassphrase: "Wolverhampton",
  workdayCron: "0 * * * 1-5",
  weekendCron: "0 */4 * * 0,6",
  lastSyncAt: null,
  lastSeq: "0",
  enabled: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeKey = {} as CryptoKey

beforeEach(() => {
  jest.clearAllMocks()
  mockCrypto.deriveKey.mockResolvedValue(fakeKey)
})

describe("getVaultConfig", () => {
  it("returns null when no config", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    expect(await getVaultConfig()).toBeNull()
  })

  it("returns config when one exists", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    expect(await getVaultConfig()).toEqual(fakeConfig)
  })
})

describe("isVaultAccessible", () => {
  it("returns false when no config", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    expect(await isVaultAccessible()).toBe(false)
  })

  it("returns true when CouchDB is reachable", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    expect(await isVaultAccessible()).toBe(true)
  })

  it("returns false when CouchDB unreachable", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(false)
    expect(await isVaultAccessible()).toBe(false)
  })
})

describe("searchVault", () => {
  it("returns empty array when no config", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    expect(await searchVault("query")).toEqual([])
  })

  it("returns empty array when vault inaccessible", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(false)
    expect(await searchVault("query")).toEqual([])
  })

  it("returns matching notes after decryption", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [{ id: "enc_id_1", key: "enc_id_1", value: { rev: "1-abc" }, doc: { _id: "enc_id_1", data: "enc_data_1", type: "newnote" } }],
      total_rows: 1,
      offset: 0,
    })
    // decrypt _id -> path, decrypt data -> content
    mockCrypto.decryptString
      .mockResolvedValueOnce("People/John Smith.md")
      .mockResolvedValueOnce("# John Smith\n\nJohn discussed the query topic.")
    const results = await searchVault("query")
    expect(results).toHaveLength(1)
    expect(results[0].path).toBe("People/John Smith.md")
    expect(results[0].title).toBe("John Smith")
    expect(results[0].snippet).toContain("query")
  })

  it("skips documents where ID decryption fails", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [{ id: "bad_id", key: "bad_id", value: { rev: "1-abc" }, doc: { _id: "bad_id", data: "x" } }],
      total_rows: 1,
      offset: 0,
    })
    mockCrypto.decryptString.mockRejectedValue(new Error("decryption failed"))
    const results = await searchVault("query")
    expect(results).toEqual([])
  })

  it("skips non-.md paths", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [{ id: "enc_id", key: "enc_id", value: { rev: "1-a" }, doc: { _id: "enc_id", data: "d" } }],
      total_rows: 1,
      offset: 0,
    })
    mockCrypto.decryptString.mockResolvedValueOnce(".obsidian/config")
    const results = await searchVault("query")
    expect(results).toEqual([])
  })

  it("uses filename as title when no H1", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCouch.couchAllDocs.mockResolvedValue({
      rows: [{ id: "enc", key: "enc", value: { rev: "1-a" }, doc: { _id: "enc", data: "d" } }],
      total_rows: 1,
      offset: 0,
    })
    mockCrypto.decryptString
      .mockResolvedValueOnce("Notes/My Note.md")
      .mockResolvedValueOnce("Some query content without heading")
    const results = await searchVault("query")
    expect(results[0].title).toBe("My Note")
  })
})

describe("getNoteContent", () => {
  it("returns decrypted content", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchGet.mockResolvedValue({ _id: "enc_id", data: "enc_data" })
    mockCrypto.decryptString.mockResolvedValue("# Note content")
    const result = await getNoteContent("enc_id")
    expect(result).toBe("# Note content")
  })

  it("returns null when document not found", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchGet.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }))
    expect(await getNoteContent("missing")).toBeNull()
  })

  it("returns null when no config", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    expect(await getNoteContent("any")).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/services/vault.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement vault.ts (reader portion)**

Create `lib/services/vault.ts`:

```ts
import { prisma } from "@/lib/db"
import { couchAllDocs, couchDbAccessible, couchGet } from "@/lib/services/vault-couch"
import { deriveKey, decryptString } from "@/lib/services/vault-crypto"
import type { VaultConfig } from "@/app/generated/prisma/client"

export async function getVaultConfig(): Promise<VaultConfig | null> {
  return prisma.vaultConfig.findFirst()
}

export async function isVaultAccessible(): Promise<boolean> {
  const config = await getVaultConfig()
  if (!config) return false
  return couchDbAccessible(config)
}

export interface VaultSearchResult {
  couchDbId: string
  path: string
  title: string
  snippet: string
  frontmatter: Record<string, unknown>
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontmatter: {}, body: content }
  const frontmatter: Record<string, unknown> = {}
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    frontmatter[key] = value
  }
  return { frontmatter, body: match[2] }
}

function extractTitle(content: string, path: string): string {
  const h1 = content.match(/^#\s+(.+)$/m)
  if (h1) return h1[1].trim()
  const filename = path.split("/").pop() ?? path
  return filename.replace(/\.md$/, "")
}

function extractSnippet(content: string, query: string): string {
  const lower = content.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, 200)
  const start = Math.max(0, idx - 80)
  const end = Math.min(content.length, idx + 120)
  return (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "")
}

export async function searchVault(query: string, limit = 10): Promise<VaultSearchResult[]> {
  const config = await getVaultConfig()
  if (!config) return []
  if (!(await couchDbAccessible(config))) return []

  const key = await deriveKey(config.e2ePassphrase)
  const allDocs = await couchAllDocs(config, { include_docs: true })
  const results: VaultSearchResult[] = []

  for (const row of allDocs.rows) {
    if (results.length >= limit) break
    const doc = row.doc as Record<string, unknown> | undefined
    if (!doc) continue

    let path: string
    try {
      path = await decryptString(key, row.id)
    } catch {
      continue // not a LiveSync note document
    }

    if (!path.endsWith(".md")) continue

    const rawData = doc.data as string | undefined
    if (!rawData) continue

    let content: string
    try {
      content = await decryptString(key, rawData)
    } catch {
      continue
    }

    if (!content.toLowerCase().includes(query.toLowerCase())) continue

    const { frontmatter, body } = parseFrontmatter(content)
    results.push({
      couchDbId: row.id,
      path,
      title: extractTitle(body, path),
      snippet: extractSnippet(content, query),
      frontmatter,
    })
  }

  return results
}

export async function getNoteContent(couchDbId: string): Promise<string | null> {
  const config = await getVaultConfig()
  if (!config) return null

  try {
    const doc = await couchGet(config, `/${config.couchDbDatabase}/${encodeURIComponent(couchDbId)}`) as Record<string, unknown>
    const key = await deriveKey(config.e2ePassphrase)
    return decryptString(key, doc.data as string)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest __tests__/services/vault.test.ts
```

Expected: All passing.

- [ ] **Step 5: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/services/vault.ts __tests__/services/vault.test.ts
git commit -m "feat: add vault reader service with CouchDB and E2E decryption"
```

---

### Task 6: Note Writer

**Files:**
- Modify: `lib/services/vault.ts`
- Modify: `__tests__/services/vault.test.ts`

- [ ] **Step 1: Write failing tests for createNote and updateNote**

Add to `__tests__/services/vault.test.ts`:

```ts
import { createNote, updateNote } from "@/lib/services/vault"
// (add prisma.vaultNote mock)
// In the existing jest.mock("@/lib/db") block, add:
//   vaultNote: { upsert: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() }

describe("createNote", () => {
  it("encrypts path and content, writes to CouchDB, upserts VaultNote", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCrypto.encryptString
      .mockResolvedValueOnce("enc_path")   // encrypted notePath -> couchDbId
      .mockResolvedValueOnce("enc_content") // encrypted content
    mockCouch.couchPut.mockResolvedValue({ ok: true, id: "enc_path", rev: "1-abc" })
    mockPrisma.vaultNote.upsert.mockResolvedValue({} as any)

    const result = await createNote("Holly/John.md", "contact", "uuid1", "# John\n\nContent")
    expect(result).toBe("enc_path")
    expect(mockCouch.couchPut).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("enc_path"),
      expect.objectContaining({ data: "enc_content", encrypted: true })
    )
    expect(mockPrisma.vaultNote.upsert).toHaveBeenCalled()
  })

  it("returns null when no config", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    expect(await createNote("Holly/Note.md", "contact", "id1", "content")).toBeNull()
  })

  it("returns null for invalid notePath (path traversal)", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    expect(await createNote("../../etc/passwd", "contact", "id1", "x")).toBeNull()
  })
})

describe("updateNote", () => {
  it("fetches, merges, encrypts, and puts updated content", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(fakeConfig as any)
    mockCouch.couchGet.mockResolvedValue({
      _id: "enc_id",
      _rev: "2-abc",
      data: "enc_old",
      type: "newnote",
      mtime: 1000,
    })
    mockCrypto.decryptString.mockResolvedValue("---\nprm_entity: contact\nprm_id: u1\n---\n\nOld body")
    mockCrypto.encryptString.mockResolvedValue("enc_new")
    mockCouch.couchPut.mockResolvedValue({ ok: true })
    mockPrisma.vaultNote.updateMany = jest.fn().mockResolvedValue({ count: 1 })

    await updateNote("enc_id", "New body content")
    expect(mockCouch.couchPut).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("enc_id"),
      expect.objectContaining({ _rev: "2-abc", data: "enc_new" })
    )
  })

  it("does nothing when no config", async () => {
    mockPrisma.vaultConfig.findFirst.mockResolvedValue(null)
    await updateNote("enc_id", "content")
    expect(mockCouch.couchPut).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/services/vault.test.ts --testNamePattern="createNote|updateNote"
```

Expected: FAIL (functions not exported).

- [ ] **Step 3: Implement createNote and updateNote in vault.ts**

Add to `lib/services/vault.ts`:

```ts
import { couchGet, couchPut } from "@/lib/services/vault-couch"
import { encryptString } from "@/lib/services/vault-crypto"

const VALID_NOTE_PATH = /^[a-zA-Z0-9 \-_/]+\.md$/

export async function createNote(
  notePath: string,
  entityType: string,
  entityId: string,
  content: string
): Promise<string | null> {
  if (!VALID_NOTE_PATH.test(notePath) || notePath.includes("..")) return null

  const config = await getVaultConfig()
  if (!config) return null

  const key = await deriveKey(config.e2ePassphrase)
  const now = Date.now()
  const frontmatter = `---\nprm_entity: ${entityType}\nprm_id: ${entityId}\ncreated: ${new Date().toISOString().slice(0, 10)}\n---\n\n`
  const fullContent = frontmatter + content

  const couchDbId = await encryptString(key, notePath)
  const encryptedContent = await encryptString(key, fullContent)

  await couchPut(config, `/${config.couchDbDatabase}/${encodeURIComponent(couchDbId)}`, {
    _id: couchDbId,
    data: encryptedContent,
    type: "newnote",
    encrypted: true,
    mtime: now,
    ctime: now,
    size: Buffer.byteLength(fullContent, "utf8"),
    children: [],
  })

  await prisma.vaultNote.upsert({
    where: { entityType_entityId: { entityType, entityId } },
    create: { entityType, entityId, couchDbId, notePath, lastSyncAt: new Date() },
    update: { couchDbId, notePath, lastSyncAt: new Date() },
  })

  return couchDbId
}

export async function updateNote(couchDbId: string, newBody: string): Promise<void> {
  const config = await getVaultConfig()
  if (!config) return

  const doc = await couchGet(config, `/${config.couchDbDatabase}/${encodeURIComponent(couchDbId)}`) as Record<string, unknown>
  const key = await deriveKey(config.e2ePassphrase)
  const existing = await decryptString(key, doc.data as string)

  // Preserve frontmatter, replace body, update last_updated
  const { frontmatter } = parseFrontmatter(existing)
  frontmatter.last_updated = new Date().toISOString().slice(0, 10)
  const fmLines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v}`).join("\n")
  const updated = `---\n${fmLines}\n---\n\n${newBody}`

  const encryptedContent = await encryptString(key, updated)
  await couchPut(config, `/${config.couchDbDatabase}/${encodeURIComponent(couchDbId)}`, {
    ...doc,
    data: encryptedContent,
    mtime: Date.now(),
    size: Buffer.byteLength(updated, "utf8"),
  })

  await prisma.vaultNote.updateMany({
    where: { couchDbId },
    data: { lastSyncAt: new Date() },
  })
}
```

- [ ] **Step 4: Run all vault tests**

```bash
npx jest __tests__/services/vault.test.ts
```

Expected: All passing.

- [ ] **Step 5: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add lib/services/vault.ts __tests__/services/vault.test.ts
git commit -m "feat: add vault note writer with E2E encryption"
```

---

### Task 7: Sync Service

**Files:**
- Create: `lib/services/vault-sync.ts`
- Create: `__tests__/services/vault-sync.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/services/vault-sync.test.ts`:

```ts
import { runVaultSync, shouldRunSync } from "@/lib/services/vault-sync"
import * as vault from "@/lib/services/vault"
import * as vaultCouch from "@/lib/services/vault-couch"
import * as vaultCrypto from "@/lib/services/vault-crypto"
import { prisma } from "@/lib/db"

jest.mock("@/lib/services/vault")
jest.mock("@/lib/services/vault-couch")
jest.mock("@/lib/services/vault-crypto")
jest.mock("@/lib/db", () => ({ prisma: { vaultConfig: { update: jest.fn() }, vaultNote: { findMany: jest.fn() } } }))

const mockVault = vault as jest.Mocked<typeof vault>
const mockCouch = vaultCouch as jest.Mocked<typeof vaultCouch>
const mockCrypto = vaultCrypto as jest.Mocked<typeof vaultCrypto>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

const fakeConfig = {
  id: "cfg1",
  enabled: true,
  lastSyncAt: new Date("2026-01-01T00:00:00Z"),
  lastSeq: "5-abc",
  workdayCron: "0 * * * 1-5",
  weekendCron: "0 */4 * * 0,6",
  e2ePassphrase: "Wolverhampton",
} as any

beforeEach(() => jest.clearAllMocks())

describe("shouldRunSync", () => {
  it("returns false when disabled", () => {
    expect(shouldRunSync({ ...fakeConfig, enabled: false })).toBe(false)
  })

  it("returns false when lastSyncAt is recent (within cron interval)", () => {
    const recentSync = new Date(Date.now() - 30 * 60 * 1000) // 30 min ago
    expect(shouldRunSync({ ...fakeConfig, lastSyncAt: recentSync })).toBe(false)
  })

  it("returns true when lastSyncAt is old enough", () => {
    const oldSync = new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
    expect(shouldRunSync({ ...fakeConfig, lastSyncAt: oldSync })).toBe(true)
  })

  it("returns true when lastSyncAt is null", () => {
    expect(shouldRunSync({ ...fakeConfig, lastSyncAt: null })).toBe(true)
  })
})

describe("runVaultSync", () => {
  it("returns early when no config", async () => {
    mockVault.getVaultConfig.mockResolvedValue(null)
    const result = await runVaultSync()
    expect(result).toEqual({ updatedNotes: [], errors: [] })
    expect(mockCouch.couchChanges).not.toHaveBeenCalled()
  })

  it("returns early when disabled", async () => {
    mockVault.getVaultConfig.mockResolvedValue({ ...fakeConfig, enabled: false })
    const result = await runVaultSync()
    expect(result).toEqual({ updatedNotes: [], errors: [] })
  })

  it("returns changed notes from _changes feed", async () => {
    mockVault.getVaultConfig.mockResolvedValue(fakeConfig)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCrypto.deriveKey.mockResolvedValue({} as CryptoKey)
    mockCouch.couchChanges.mockResolvedValue({
      results: [{ id: "enc_id", seq: "6-xyz", doc: { _id: "enc_id", data: "enc_data", type: "newnote" } }],
      last_seq: "6-xyz",
    })
    mockCrypto.decryptString
      .mockResolvedValueOnce("People/Jane.md")
      .mockResolvedValueOnce("# Jane\n\nContent about Jane")
    mockPrisma.vaultNote.findMany.mockResolvedValue([])
    mockPrisma.vaultConfig.update.mockResolvedValue(fakeConfig)

    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(1)
    expect(result.updatedNotes[0].path).toBe("People/Jane.md")
    expect(mockPrisma.vaultConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastSeq: "6-xyz" }) })
    )
  })

  it("skips documents where decryption fails", async () => {
    mockVault.getVaultConfig.mockResolvedValue(fakeConfig)
    mockCouch.couchDbAccessible.mockResolvedValue(true)
    mockCrypto.deriveKey.mockResolvedValue({} as CryptoKey)
    mockCouch.couchChanges.mockResolvedValue({
      results: [{ id: "bad_enc", seq: "6-x", doc: { _id: "bad_enc", data: "garbage" } }],
      last_seq: "6-x",
    })
    mockCrypto.decryptString.mockRejectedValue(new Error("decryption failed"))
    mockPrisma.vaultNote.findMany.mockResolvedValue([])
    mockPrisma.vaultConfig.update.mockResolvedValue(fakeConfig)

    const result = await runVaultSync()
    expect(result.updatedNotes).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/services/vault-sync.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement vault-sync.ts**

Create `lib/services/vault-sync.ts`:

```ts
import { prisma } from "@/lib/db"
import { getVaultConfig, isVaultAccessible, VaultSearchResult, parseFrontmatter, extractTitle, extractSnippet } from "@/lib/services/vault"
import { couchChanges, couchDbAccessible } from "@/lib/services/vault-couch"
import { deriveKey, decryptString } from "@/lib/services/vault-crypto"
import type { VaultConfig } from "@/app/generated/prisma/client"

export interface VaultSyncResult {
  updatedNotes: VaultSearchResult[]
  errors: string[]
}

export function shouldRunSync(config: VaultConfig): boolean {
  if (!config.enabled) return false
  if (!config.lastSyncAt) return true
  // Parse cron interval: extract the hour step from the cron expression
  // Supported patterns: "0 * * * *" (hourly), "0 */2 * * *" (every 2h), etc.
  const isWeekend = [0, 6].includes(new Date().getDay())
  const cron = isWeekend ? config.weekendCron : config.workdayCron
  const hourField = cron.split(" ")[1]
  let intervalHours = 1
  if (hourField.startsWith("*/")) {
    intervalHours = parseInt(hourField.slice(2), 10) || 1
  } else if (hourField === "9,17") {
    intervalHours = 8
  } else if (hourField === "9") {
    intervalHours = 24
  }
  const msSinceSync = Date.now() - config.lastSyncAt.getTime()
  return msSinceSync >= intervalHours * 60 * 60 * 1000
}

export async function runVaultSync(): Promise<VaultSyncResult> {
  const config = await getVaultConfig()
  if (!config || !config.enabled) return { updatedNotes: [], errors: [] }
  if (!(await couchDbAccessible(config))) return { updatedNotes: [], errors: [] }

  const key = await deriveKey(config.e2ePassphrase)
  const changes = await couchChanges(config, config.lastSeq)
  const updatedNotes: VaultSearchResult[] = []
  const errors: string[] = []

  for (const change of changes.results) {
    if (change.deleted) continue
    const doc = change.doc as Record<string, unknown> | undefined
    if (!doc) continue

    let path: string
    try {
      path = await decryptString(key, change.id)
    } catch {
      continue
    }
    if (!path.endsWith(".md")) continue

    let content: string
    try {
      content = await decryptString(key, doc.data as string)
    } catch (e) {
      errors.push(`Failed to decrypt ${change.id}: ${e}`)
      continue
    }

    const { frontmatter, body } = parseFrontmatter(content)
    updatedNotes.push({
      couchDbId: change.id,
      path,
      title: extractTitle(body, path),
      snippet: content.slice(0, 200),
      frontmatter,
    })
  }

  await prisma.vaultConfig.update({
    where: { id: config.id },
    data: { lastSyncAt: new Date(), lastSeq: changes.last_seq },
  })

  return { updatedNotes, errors }
}
```

Note: `parseFrontmatter`, `extractTitle`, and `extractSnippet` need to be exported from `vault.ts` for vault-sync to import them.

- [ ] **Step 4: Export helpers from vault.ts**

In `lib/services/vault.ts`, change the three helper functions from non-exported to exported:

```ts
export function parseFrontmatter(...)
export function extractTitle(...)
export function extractSnippet(...)
```

- [ ] **Step 5: Run all sync tests**

```bash
npx jest __tests__/services/vault-sync.test.ts
```

Expected: All passing.

- [ ] **Step 6: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add lib/services/vault-sync.ts __tests__/services/vault-sync.test.ts lib/services/vault.ts
git commit -m "feat: add vault sync service using CouchDB _changes feed"
```

---

### Task 8: Cron and Briefing Integration

**Files:**
- Modify: `app/api/v1/cron/notify/route.ts`
- Modify: `lib/services/briefing.ts`

- [ ] **Step 1: Read current cron route**

Read `app/api/v1/cron/notify/route.ts` to identify where to insert the vault sync step (after the Gmail poll step).

- [ ] **Step 2: Add vault sync step to cron route**

After the Gmail poll try/catch block, add:

```ts
// 4. Vault sync
try {
  const vaultConfig = await getVaultConfig()
  if (vaultConfig && shouldRunSync(vaultConfig)) {
    const result = await runVaultSync()
    await redis.set("vault:sync:latest", JSON.stringify(result), "EX", 7200)
  }
} catch (e) {
  console.error("[cron/notify] vault sync failed", e)
}
```

Add imports at the top:
```ts
import { getVaultConfig } from "@/lib/services/vault"
import { shouldRunSync, runVaultSync } from "@/lib/services/vault-sync"
```

- [ ] **Step 3: Read current briefing service**

Read `lib/services/briefing.ts` to understand the current return shape.

- [ ] **Step 4: Add vaultUpdates to getBriefing**

In `lib/services/briefing.ts`, in the `getBriefing` function, add:

```ts
let vaultUpdates: VaultSearchResult[] = []
try {
  const cached = await redis.get("vault:sync:latest")
  if (cached) {
    const parsed = JSON.parse(cached)
    vaultUpdates = parsed.updatedNotes ?? []
  }
} catch {
  // Redis unavailable - proceed without vault updates
}

return {
  // ... existing fields ...
  vaultUpdates,
}
```

Add import: `import type { VaultSearchResult } from "@/lib/services/vault"`

- [ ] **Step 5: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/v1/cron/notify/route.ts lib/services/briefing.ts
git commit -m "feat: integrate vault sync into cron and briefing"
```

---

### Task 9: Holly API Routes

**Files:**
- Create: `app/api/holly/v1/vault/search/route.ts`
- Create: `app/api/holly/v1/vault/note/route.ts`
- Create: `app/api/holly/v1/vault/sync/route.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/holly/vault.test.ts`:

```ts
import { GET as searchGet } from "@/app/api/holly/v1/vault/search/route"
import { GET as noteGet, POST as notePost, PATCH as notePatch } from "@/app/api/holly/v1/vault/note/route"
import { POST as syncPost } from "@/app/api/holly/v1/vault/sync/route"
import { NextRequest } from "next/server"

jest.mock("@/lib/services/vault", () => ({
  isVaultAccessible: jest.fn(),
  searchVault: jest.fn(),
  getNoteContent: jest.fn(),
  createNote: jest.fn(),
  updateNote: jest.fn(),
  getVaultConfig: jest.fn(),
}))
jest.mock("@/lib/services/vault-sync", () => ({ runVaultSync: jest.fn() }))

import * as vault from "@/lib/services/vault"
import { runVaultSync } from "@/lib/services/vault-sync"

const mockVault = vault as jest.Mocked<typeof vault>
const mockSync = runVaultSync as jest.Mock

const API_KEY = "test-key"
process.env.HOLLY_API_KEY = API_KEY

function req(url: string, opts?: RequestInit) {
  return new NextRequest(url, {
    ...opts,
    headers: { "X-Holly-API-Key": API_KEY, "Content-Type": "application/json", ...(opts?.headers ?? {}) },
  })
}

beforeEach(() => jest.clearAllMocks())

it("GET /vault/search returns 401 without API key", async () => {
  const res = await searchGet(new NextRequest("http://localhost/api/holly/v1/vault/search?q=test"))
  expect(res.status).toBe(401)
})

it("GET /vault/search returns 503 when vault not accessible", async () => {
  mockVault.isVaultAccessible.mockResolvedValue(false)
  const res = await searchGet(req("http://localhost/api/holly/v1/vault/search?q=test"))
  expect(res.status).toBe(503)
})

it("GET /vault/search returns results", async () => {
  mockVault.isVaultAccessible.mockResolvedValue(true)
  mockVault.searchVault.mockResolvedValue([{ couchDbId: "enc", path: "Note.md", title: "Note", snippet: "test", frontmatter: {} }])
  const res = await searchGet(req("http://localhost/api/holly/v1/vault/search?q=test"))
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.results).toHaveLength(1)
})

it("GET /vault/note returns 400 without id", async () => {
  mockVault.isVaultAccessible.mockResolvedValue(true)
  const res = await noteGet(req("http://localhost/api/holly/v1/vault/note"))
  expect(res.status).toBe(400)
})

it("GET /vault/note returns 404 when not found", async () => {
  mockVault.isVaultAccessible.mockResolvedValue(true)
  mockVault.getNoteContent.mockResolvedValue(null)
  const res = await noteGet(req("http://localhost/api/holly/v1/vault/note?id=enc_id"))
  expect(res.status).toBe(404)
})

it("GET /vault/note returns content", async () => {
  mockVault.isVaultAccessible.mockResolvedValue(true)
  mockVault.getNoteContent.mockResolvedValue("# Note\n\nContent")
  const res = await noteGet(req("http://localhost/api/holly/v1/vault/note?id=enc_id"))
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.content).toBe("# Note\n\nContent")
})

it("POST /vault/note creates note and returns 201", async () => {
  mockVault.isVaultAccessible.mockResolvedValue(true)
  mockVault.createNote.mockResolvedValue("new_enc_id")
  const res = await notePost(req("http://localhost/api/holly/v1/vault/note", {
    method: "POST",
    body: JSON.stringify({ notePath: "Holly/Test.md", entityType: "contact", entityId: "uuid1", content: "# Test" }),
  }))
  expect(res.status).toBe(201)
})

it("POST /vault/note returns 422 for missing fields", async () => {
  mockVault.isVaultAccessible.mockResolvedValue(true)
  const res = await notePost(req("http://localhost/api/holly/v1/vault/note", {
    method: "POST",
    body: JSON.stringify({ notePath: "Holly/Test.md" }),
  }))
  expect(res.status).toBe(422)
})

it("PATCH /vault/note updates note and returns 200", async () => {
  mockVault.isVaultAccessible.mockResolvedValue(true)
  mockVault.updateNote.mockResolvedValue(undefined)
  const res = await notePatch(req("http://localhost/api/holly/v1/vault/note", {
    method: "PATCH",
    body: JSON.stringify({ couchDbId: "enc_id", content: "Updated content" }),
  }))
  expect(res.status).toBe(200)
})

it("POST /vault/sync triggers sync and returns result", async () => {
  mockVault.getVaultConfig.mockResolvedValue({ enabled: true } as any)
  mockSync.mockResolvedValue({ updatedNotes: [], errors: [] })
  const res = await syncPost(req("http://localhost/api/holly/v1/vault/sync", { method: "POST" }))
  expect(res.status).toBe(200)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/holly/vault.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create search route**

Create `app/api/holly/v1/vault/search/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { isVaultAccessible, searchVault } from "@/lib/services/vault"

function authorized(req: NextRequest) {
  return req.headers.get("X-Holly-API-Key") === process.env.HOLLY_API_KEY
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isVaultAccessible())) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  const q = req.nextUrl.searchParams.get("q") ?? ""
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10)
  const results = await searchVault(q, limit)
  return NextResponse.json({ results, query: q, total: results.length })
}
```

- [ ] **Step 4: Create note route**

Create `app/api/holly/v1/vault/note/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { isVaultAccessible, getNoteContent, createNote, updateNote } from "@/lib/services/vault"

function authorized(req: NextRequest) {
  return req.headers.get("X-Holly-API-Key") === process.env.HOLLY_API_KEY
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isVaultAccessible())) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Missing id parameter" }, { status: 400 })

  const content = await getNoteContent(id)
  if (content === null) return NextResponse.json({ error: "Note not found" }, { status: 404 })

  return NextResponse.json({ couchDbId: id, content })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isVaultAccessible())) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  const body = await req.json()
  const { notePath, entityType, entityId, content } = body
  if (!notePath || !entityType || !entityId || !content) {
    return NextResponse.json({ error: "Missing required fields: notePath, entityType, entityId, content" }, { status: 422 })
  }

  const couchDbId = await createNote(notePath, entityType, entityId, content)
  if (couchDbId === null) return NextResponse.json({ error: "Invalid notePath" }, { status: 422 })

  return NextResponse.json({ couchDbId }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await isVaultAccessible())) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  const body = await req.json()
  const { couchDbId, content } = body
  if (!couchDbId || !content) {
    return NextResponse.json({ error: "Missing required fields: couchDbId, content" }, { status: 422 })
  }

  await updateNote(couchDbId, content)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Create sync route**

Create `app/api/holly/v1/vault/sync/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { getVaultConfig } from "@/lib/services/vault"
import { runVaultSync } from "@/lib/services/vault-sync"

function authorized(req: NextRequest) {
  return req.headers.get("X-Holly-API-Key") === process.env.HOLLY_API_KEY
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const config = await getVaultConfig()
  if (!config) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  const result = await runVaultSync()
  return NextResponse.json(result)
}
```

- [ ] **Step 6: Run all Holly vault tests**

```bash
npx jest __tests__/api/holly/vault.test.ts
```

Expected: All passing.

- [ ] **Step 7: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add app/api/holly/v1/vault/
git commit -m "feat: add Holly vault API routes (search, note CRUD, sync)"
```

---

### Task 10: Web Session API Routes

**Files:**
- Create: `app/api/v1/vault/status/route.ts`
- Create: `app/api/v1/vault/config/route.ts`
- Create: `app/api/v1/vault/sync/route.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/api/v1/vault-routes.test.ts`:

```ts
import { GET as statusGet } from "@/app/api/v1/vault/status/route"
import { POST as configPost } from "@/app/api/v1/vault/config/route"
import { POST as syncPost } from "@/app/api/v1/vault/sync/route"
import { NextRequest } from "next/server"

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/lib/services/vault", () => ({
  getVaultConfig: jest.fn(),
  isVaultAccessible: jest.fn(),
}))
jest.mock("@/lib/services/vault-sync", () => ({ runVaultSync: jest.fn() }))
jest.mock("@/lib/db", () => ({ prisma: { vaultConfig: { upsert: jest.fn(), findFirst: jest.fn() } } }))

import { auth } from "@/lib/auth"
import * as vault from "@/lib/services/vault"
import { runVaultSync } from "@/lib/services/vault-sync"
import { prisma } from "@/lib/db"

const mockAuth = auth as jest.Mock
const mockVault = vault as jest.Mocked<typeof vault>
const mockSync = runVaultSync as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>

beforeEach(() => jest.clearAllMocks())

it("GET /vault/status returns 401 when unauthenticated", async () => {
  mockAuth.mockResolvedValue(null)
  const res = await statusGet()
  expect(res.status).toBe(401)
})

it("GET /vault/status returns config without secrets", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockVault.getVaultConfig.mockResolvedValue({
    couchDbUrl: "http://localhost:5984",
    couchDbDatabase: "obsidian",
    couchDbUsername: "vaelerian",
    couchDbPassword: "secret",
    e2ePassphrase: "Wolverhampton",
    lastSyncAt: null,
    lastSeq: "0",
    enabled: true,
    workdayCron: "0 * * * 1-5",
    weekendCron: "0 */4 * * 0,6",
  } as any)
  mockVault.isVaultAccessible.mockResolvedValue(true)
  const res = await statusGet()
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.passwordSet).toBe(true)
  expect(data.couchDbPassword).toBeUndefined()
  expect(data.e2ePassphrase).toBeUndefined()
})

it("POST /vault/config saves config and returns 200", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockVault.getVaultConfig.mockResolvedValue(null)
  mockPrisma.vaultConfig.upsert.mockResolvedValue({} as any)
  const req = new NextRequest("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      couchDbUrl: "http://localhost:5984",
      couchDbDatabase: "obsidian",
      couchDbUsername: "vaelerian",
      couchDbPassword: "pass",
      e2ePassphrase: "phrase",
    }),
  })
  const res = await configPost(req)
  expect(res.status).toBe(200)
})

it("POST /vault/sync triggers sync", async () => {
  mockAuth.mockResolvedValue({ userId: "u1" })
  mockVault.getVaultConfig.mockResolvedValue({ enabled: true } as any)
  mockSync.mockResolvedValue({ updatedNotes: [], errors: [] })
  const req = new NextRequest("http://localhost/", { method: "POST" })
  const res = await syncPost(req)
  expect(res.status).toBe(200)
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx jest __tests__/api/v1/vault-routes.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create status route**

Create `app/api/v1/vault/status/route.ts`:

```ts
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getVaultConfig, isVaultAccessible } from "@/lib/services/vault"

export async function GET() {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const config = await getVaultConfig()
  if (!config) return NextResponse.json({ configured: false, accessible: false })

  const accessible = await isVaultAccessible()
  return NextResponse.json({
    configured: true,
    accessible,
    couchDbUrl: config.couchDbUrl,
    couchDbDatabase: config.couchDbDatabase,
    couchDbUsername: config.couchDbUsername,
    passwordSet: config.couchDbPassword.length > 0,
    e2ePassphraseSet: config.e2ePassphrase.length > 0,
    lastSyncAt: config.lastSyncAt,
    lastSeq: config.lastSeq,
    enabled: config.enabled,
    workdayCron: config.workdayCron,
    weekendCron: config.weekendCron,
  })
}
```

- [ ] **Step 4: Create config route**

Create `app/api/v1/vault/config/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getVaultConfig } from "@/lib/services/vault"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { couchDbUrl, couchDbDatabase, couchDbUsername, couchDbPassword, e2ePassphrase, workdayCron, weekendCron, enabled } = body

  if (!couchDbUrl || !couchDbDatabase || !couchDbUsername) {
    return NextResponse.json({ error: "Missing required fields: couchDbUrl, couchDbDatabase, couchDbUsername" }, { status: 422 })
  }

  const existing = await getVaultConfig()
  const id = existing?.id ?? crypto.randomUUID()

  const data: Record<string, unknown> = {
    couchDbUrl,
    couchDbDatabase,
    couchDbUsername,
    ...(workdayCron && { workdayCron }),
    ...(weekendCron && { weekendCron }),
    ...(enabled !== undefined && { enabled }),
  }
  // Only update secrets if provided (non-empty string)
  if (couchDbPassword) data.couchDbPassword = couchDbPassword
  if (e2ePassphrase) data.e2ePassphrase = e2ePassphrase

  await prisma.vaultConfig.upsert({
    where: { id },
    create: { id, couchDbUrl, couchDbDatabase, couchDbUsername, couchDbPassword: couchDbPassword ?? "", e2ePassphrase: e2ePassphrase ?? "" },
    update: data,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Create web sync route**

Create `app/api/v1/vault/sync/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getVaultConfig } from "@/lib/services/vault"
import { runVaultSync } from "@/lib/services/vault-sync"

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const config = await getVaultConfig()
  if (!config) return NextResponse.json({ error: "vault_not_configured" }, { status: 503 })

  const result = await runVaultSync()
  return NextResponse.json(result)
}
```

- [ ] **Step 6: Run all web vault route tests**

```bash
npx jest __tests__/api/v1/vault-routes.test.ts
```

Expected: All passing.

- [ ] **Step 7: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 8: Commit**

```bash
git add app/api/v1/vault/
git commit -m "feat: add web session vault API routes (status, config, sync)"
```

---

### Task 11: Settings UI

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Read current settings page**

Read `app/(dashboard)/settings/page.tsx` to understand the current structure.

- [ ] **Step 2: Add Obsidian Vault section**

Add the Obsidian Vault section as a new `<section>` at the bottom of the settings page. The section is a client component because it has form state.

Create `components/settings/vault-settings.tsx`:

```tsx
"use client"
import { useState } from "react"

interface VaultStatus {
  configured: boolean
  accessible: boolean
  couchDbUrl?: string
  couchDbDatabase?: string
  couchDbUsername?: string
  passwordSet?: boolean
  e2ePassphraseSet?: boolean
  lastSyncAt?: string | null
  lastSeq?: string
  enabled?: boolean
  workdayCron?: string
  weekendCron?: string
}

const CRON_OPTIONS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 2 hours", value: "0 */2 * * *" },
  { label: "Every 4 hours", value: "0 */4 * * *" },
  { label: "Twice daily (9am and 5pm)", value: "0 9,17 * * *" },
  { label: "Once daily (9am)", value: "0 9 * * *" },
]

export function VaultSettings({ initial }: { initial: VaultStatus }) {
  const [status, setStatus] = useState(initial)
  const [couchDbUrl, setCouchDbUrl] = useState(initial.couchDbUrl ?? "http://localhost:5984")
  const [couchDbDatabase, setCouchDbDatabase] = useState(initial.couchDbDatabase ?? "obsidian")
  const [couchDbUsername, setCouchDbUsername] = useState(initial.couchDbUsername ?? "")
  const [couchDbPassword, setCouchDbPassword] = useState("")
  const [e2ePassphrase, setE2ePassphrase] = useState("")
  const [workdayCron, setWorkdayCron] = useState(initial.workdayCron ?? "0 * * * *")
  const [weekendCron, setWeekendCron] = useState(initial.weekendCron ?? "0 */4 * * *")
  const [enabled, setEnabled] = useState(initial.enabled ?? true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function testConnection() {
    setTesting(true)
    setError(null)
    try {
      const res = await fetch("/api/v1/vault/status")
      const data = await res.json()
      setStatus(data)
      setMessage(data.accessible ? "Connected successfully" : "CouchDB unreachable - check URL and credentials")
    } catch {
      setError("Request failed")
    } finally {
      setTesting(false)
    }
  }

  async function saveConfig() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch("/api/v1/vault/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couchDbUrl, couchDbDatabase, couchDbUsername, couchDbPassword, e2ePassphrase, workdayCron, weekendCron, enabled }),
      })
      if (!res.ok) throw new Error("Save failed")
      setMessage("Settings saved")
    } catch {
      setError("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  async function syncNow() {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch("/api/v1/vault/sync", { method: "POST" })
      const data = await res.json()
      setMessage(`Sync complete - ${data.updatedNotes?.length ?? 0} updated notes`)
      const statusRes = await fetch("/api/v1/vault/status")
      setStatus(await statusRes.json())
    } catch {
      setError("Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  return (
    <section className="border border-[rgba(0,255,136,0.15)] rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-[#c0c0d0]">Obsidian Vault</h2>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {message && <p className="text-xs text-[#00ff88]">{message}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#666688]">CouchDB URL</span>
          <input value={couchDbUrl} onChange={e => setCouchDbUrl(e.target.value)}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#666688]">Database name</span>
          <input value={couchDbDatabase} onChange={e => setCouchDbDatabase(e.target.value)}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#666688]">Username</span>
          <input value={couchDbUsername} onChange={e => setCouchDbUsername(e.target.value)}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#666688]">Password {status.passwordSet && <span className="text-[#00ff88]">(set)</span>}</span>
          <input type="password" value={couchDbPassword} onChange={e => setCouchDbPassword(e.target.value)}
            placeholder={status.passwordSet ? "Leave blank to keep existing" : "Enter password"}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]" />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs text-[#666688]">E2E passphrase {status.e2ePassphraseSet && <span className="text-[#00ff88]">(set)</span>}</span>
          <input type="password" value={e2ePassphrase} onChange={e => setE2ePassphrase(e.target.value)}
            placeholder={status.e2ePassphraseSet ? "Leave blank to keep existing" : "Enter LiveSync passphrase"}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]" />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#666688]">Work days sync</span>
          <select value={workdayCron} onChange={e => setWorkdayCron(e.target.value)}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]">
            {CRON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[#666688]">Weekends sync</span>
          <select value={weekendCron} onChange={e => setWeekendCron(e.target.value)}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-2 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none focus:ring-2 focus:ring-[#00ff88]">
            {CRON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setEnabled(e => !e)}
          className={`w-10 h-5 rounded-full transition-colors ${enabled ? "bg-[#00ff88]" : "bg-[#333355]"}`}>
          <span className={`block w-4 h-4 rounded-full bg-white mx-0.5 transition-transform ${enabled ? "translate-x-5" : ""}`} />
        </button>
        <span className="text-xs text-[#666688]">{enabled ? "Sync enabled" : "Sync paused"}</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={testConnection} disabled={testing}
          className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#c0c0d0] text-xs px-3 py-1.5 rounded-lg hover:bg-[rgba(0,255,136,0.08)] disabled:opacity-50">
          {testing ? "Testing..." : "Test connection"}
        </button>
        <button onClick={saveConfig} disabled={saving}
          className="bg-[#00ff88] text-[#0a0a1a] text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[#00cc6f] disabled:opacity-50">
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={syncNow} disabled={syncing}
          className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#c0c0d0] text-xs px-3 py-1.5 rounded-lg hover:bg-[rgba(0,255,136,0.08)] disabled:opacity-50">
          {syncing ? "Syncing..." : "Sync now"}
        </button>
        {status.lastSyncAt && (
          <span className="text-xs text-[#666688]">
            Last synced: {new Date(status.lastSyncAt).toLocaleString("en-GB")}
          </span>
        )}
        {!status.lastSyncAt && status.configured && (
          <span className="text-xs text-[#666688]">Never synced</span>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Import VaultSettings in settings page**

In `app/(dashboard)/settings/page.tsx`:
1. Add `import { VaultSettings } from "@/components/settings/vault-settings"`
2. Fetch vault status server-side:
   ```ts
   const vaultStatus = await fetch(`${process.env.NEXTAUTH_URL}/api/v1/vault/status`, {
     headers: { Cookie: ... } // pass session cookie
   }).then(r => r.json()).catch(() => ({ configured: false, accessible: false }))
   ```
   Or call the service layer directly (preferred for server components):
   ```ts
   import { getVaultConfig, isVaultAccessible } from "@/lib/services/vault"
   const vaultConfig = await getVaultConfig()
   const vaultAccessible = vaultConfig ? await isVaultAccessible() : false
   const vaultStatus = { configured: !!vaultConfig, accessible: vaultAccessible, ...vaultConfig, passwordSet: !!vaultConfig?.couchDbPassword, e2ePassphraseSet: !!vaultConfig?.e2ePassphrase }
   ```
3. Add `<VaultSettings initial={vaultStatus} />` at the bottom of the settings content.

- [ ] **Step 4: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/settings/vault-settings.tsx app/(dashboard)/settings/page.tsx
git commit -m "feat: add Obsidian Vault settings UI section"
```

---

### Task 12: Full Test Run

- [ ] **Step 1: Run all tests**

```bash
npx jest
```

Expected: All passing.

- [ ] **Step 2: If any tests fail, fix them before proceeding**

- [ ] **Step 3: Commit any fixes**

```bash
git add -p
git commit -m "fix: resolve Phase 5 test failures"
```
