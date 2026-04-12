import type { VaultConfig } from "@/app/generated/prisma/client"

function basicAuth(username: string, password: string) {
  return "Basic " + Buffer.from(`${username}:${password}`).toString("base64")
}

async function couchFetch(config: VaultConfig, path: string, options: RequestInit = {}) {
  const url = `${config.couchDbUrl}/${config.couchDbDatabase}/${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuth(config.couchDbUsername, config.couchDbPassword),
      ...(options.headers as Record<string, string> ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`CouchDB ${res.status}: ${JSON.stringify(body)}`)
  }
  return res.json()
}

export async function couchGet(config: VaultConfig, docId: string): Promise<Record<string, unknown>> {
  return couchFetch(config, encodeURIComponent(docId))
}

export async function couchPut(config: VaultConfig, docId: string, body: unknown): Promise<void> {
  await couchFetch(config, encodeURIComponent(docId), { method: "PUT", body: JSON.stringify(body) })
}

export interface CouchAllDocsResult {
  rows: Array<{ id: string; key: string; value: { rev: string }; doc?: Record<string, unknown> }>
  total_rows: number
  offset: number
}

export async function couchAllDocs(config: VaultConfig, options: { include_docs?: boolean } = {}): Promise<CouchAllDocsResult> {
  const params = new URLSearchParams()
  if (options.include_docs) params.set("include_docs", "true")
  return couchFetch(config, `_all_docs?${params}`)
}

export interface CouchChangesResult {
  results: Array<{ id: string; seq: string; deleted?: boolean; doc?: Record<string, unknown> }>
  last_seq: string
}

export async function couchChanges(config: VaultConfig, since: string): Promise<CouchChangesResult> {
  const params = new URLSearchParams({ since, include_docs: "true" })
  return couchFetch(config, `_changes?${params}`)
}

export async function couchDbAccessible(config: VaultConfig): Promise<boolean> {
  try {
    const url = `${config.couchDbUrl}/${config.couchDbDatabase}`
    const res = await fetch(url, {
      headers: { Authorization: basicAuth(config.couchDbUsername, config.couchDbPassword) },
    })
    return res.ok
  } catch {
    return false
  }
}
