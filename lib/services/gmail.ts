import { google } from "googleapis"
import { prisma } from "@/lib/db"
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google"

export interface GmailEmail {
  threadId: string
  subject: string
  from: string
  to: string
  snippet: string
  date: string
  contactId: string
  contactName: string
}

export interface GmailThread {
  threadId: string
  subject: string
  messages: Array<{
    from: string
    to: string
    date: string
    body: string
  }>
}

function extractHeader(headers: Array<{ name?: string | null; value?: string | null }>, name: string): string {
  return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
}

interface GmailPart {
  mimeType?: string | null
  body?: { data?: string | null } | null
  parts?: GmailPart[] | null
}

function decodeBody(part: GmailPart): string {
  // Prefer plain text, fall back to html
  if (part.mimeType === "text/plain" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8")
  }
  if (part.parts) {
    // Walk multipart/* recursively, prefer text/plain
    const plain = part.parts.find(p => p.mimeType === "text/plain")
    if (plain) return decodeBody(plain)
    // Fall back to first part
    for (const child of part.parts) {
      const decoded = decodeBody(child)
      if (decoded) return decoded
    }
  }
  if (part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8")
  }
  return ""
}

export async function fetchRecentEmails(options: { hours?: number } = {}): Promise<GmailEmail[]> {
  const hours = options.hours ?? 24
  try {
    const client = await getGoogleClient()
    const gmail = google.gmail({ version: "v1", auth: client })

    // Get all contact email addresses
    const contacts = await prisma.contact.findMany({
      select: { id: true, name: true, emails: true },
    })
    if (contacts.length === 0) return []

    const emailToContact = new Map<string, { id: string; name: string }>()
    for (const contact of contacts) {
      const emails = contact.emails as Array<{ address: string }>
      for (const e of emails) {
        if (e.address) emailToContact.set(e.address.toLowerCase(), { id: contact.id, name: contact.name })
      }
    }
    if (emailToContact.size === 0) return []

    const after = Math.floor((Date.now() - hours * 60 * 60 * 1000) / 1000)
    const query = `after:${after}`

    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 50,
    })

    const messages = listRes.data.messages ?? []
    const results: GmailEmail[] = []

    for (const msg of messages) {
      if (!msg.id) continue
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      })
      const headers = full.data.payload?.headers ?? []
      const from = extractHeader(headers, "From")
      const to = extractHeader(headers, "To")
      const subject = extractHeader(headers, "Subject")
      const date = extractHeader(headers, "Date")
      const snippet = full.data.snippet ?? ""
      const threadId = full.data.threadId ?? msg.id

      // Match from or to against known contacts
      const allAddresses = [from, to].join(" ").toLowerCase()
      let matched: { id: string; name: string } | undefined
      for (const [addr, contact] of emailToContact) {
        if (allAddresses.includes(addr)) { matched = contact; break }
      }
      if (!matched) continue

      results.push({ threadId, subject, from, to, snippet, date, contactId: matched.id, contactName: matched.name })
    }

    return results
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return []
    console.error("[gmail] fetchRecentEmails failed", err)
    return []
  }
}

export async function getEmailThread(threadId: string): Promise<GmailThread | null> {
  try {
    const client = await getGoogleClient()
    const gmail = google.gmail({ version: "v1", auth: client })

    const thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" })
    const messages = thread.data.messages ?? []
    if (messages.length === 0) return null

    const firstHeaders = messages[0].payload?.headers ?? []
    const subject = extractHeader(firstHeaders, "Subject")

    const parsedMessages = messages.map(msg => {
      const headers = msg.payload?.headers ?? []
      return {
        from: extractHeader(headers, "From"),
        to: extractHeader(headers, "To"),
        date: extractHeader(headers, "Date"),
        body: decodeBody(msg.payload as GmailPart),
      }
    })

    return { threadId, subject, messages: parsedMessages }
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return null
    console.error("[gmail] getEmailThread failed", err)
    return null
  }
}
