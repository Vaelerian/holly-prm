import { couchGet, couchPut, couchAllDocs, couchChanges, couchDbAccessible } from "@/lib/services/vault-couch"

const fetchMock = jest.fn()
global.fetch = fetchMock

beforeEach(() => jest.clearAllMocks())

const fakeConfig = {
  couchDbUrl: "http://localhost:5984",
  couchDbDatabase: "obsidian",
  couchDbUsername: "vaelerian",
  couchDbPassword: "testpass",
} as any

it("couchGet fetches with basic auth header", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ _id: "doc1" }) })
  const result = await couchGet(fakeConfig, "doc1")
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:5984/obsidian/doc1",
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining("Basic ") }) })
  )
  expect(result).toEqual({ _id: "doc1" })
})

it("couchGet throws on non-ok response", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "not_found" }) })
  await expect(couchGet(fakeConfig, "missing")).rejects.toThrow("404")
})

it("couchPut sends PUT with JSON body", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, id: "doc1", rev: "1-abc" }) })
  await couchPut(fakeConfig, "doc1", { _id: "doc1", data: "test" })
  expect(fetchMock).toHaveBeenCalledWith(
    "http://localhost:5984/obsidian/doc1",
    expect.objectContaining({ method: "PUT", body: expect.stringContaining("doc1") })
  )
})

it("couchDbAccessible returns true on 200", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  expect(await couchDbAccessible(fakeConfig)).toBe(true)
})

it("couchDbAccessible returns false on network error", async () => {
  fetchMock.mockRejectedValue(new Error("ECONNREFUSED"))
  expect(await couchDbAccessible(fakeConfig)).toBe(false)
})

it("couchDbAccessible returns false on non-ok response", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
  expect(await couchDbAccessible(fakeConfig)).toBe(false)
})

it("couchAllDocs calls _all_docs with include_docs=true", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ rows: [], total_rows: 0, offset: 0 }) })
  const result = await couchAllDocs(fakeConfig, { include_docs: true })
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("_all_docs"),
    expect.any(Object)
  )
  expect(fetchMock.mock.calls[0][0]).toContain("include_docs=true")
  expect(result.rows).toEqual([])
})

it("couchChanges calls _changes with since param", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [], last_seq: "5-abc" }) })
  const result = await couchChanges(fakeConfig, "3-xyz")
  expect(fetchMock.mock.calls[0][0]).toContain("since=3-xyz")
  expect(result.last_seq).toBe("5-abc")
})
