import { google } from "googleapis"
import { prisma } from "@/lib/db"
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google"
import type { CalendarEntityType } from "@/app/generated/prisma/client"

export interface CalendarEventData {
  title: string
  description?: string
  date: Date
}

export interface GoogleCalendarEvent {
  googleEventId: string
  title: string
  date: string
  calendarId: string
}

export async function upsertCalendarEvent(
  entityType: CalendarEntityType,
  entityId: string,
  data: CalendarEventData,
  userId: string
): Promise<void> {
  let client
  try {
    client = await getGoogleClient(userId)
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return
    console.error("[calendar-sync] getGoogleClient failed", err)
    return
  }

  const calendar = google.calendar({ version: "v3", auth: client })
  const dateStr = data.date.toISOString().split("T")[0]
  const event = {
    summary: data.title,
    description: data.description ?? "",
    start: { date: dateStr },
    end: { date: dateStr },
  }

  try {
    const existing = await prisma.calendarSync.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
    })

    if (existing) {
      await calendar.events.update({
        calendarId: "primary",
        eventId: existing.googleEventId,
        requestBody: event,
      })
    } else {
      const created = await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
      })
      if (created.data.id) {
        await prisma.calendarSync.create({
          data: {
            entityType,
            entityId,
            googleEventId: created.data.id,
            calendarId: "primary",
          },
        })
      }
    }
  } catch (err) {
    console.error("[calendar-sync] upsertCalendarEvent failed", entityType, entityId, err)
  }
}

export async function deleteCalendarEvent(
  entityType: CalendarEntityType,
  entityId: string,
  userId: string
): Promise<void> {
  let client
  try {
    client = await getGoogleClient(userId)
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return
    console.error("[calendar-sync] getGoogleClient failed", err)
    return
  }

  const calendar = google.calendar({ version: "v3", auth: client })

  try {
    const existing = await prisma.calendarSync.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
    })
    if (!existing) return

    await calendar.events.delete({ calendarId: "primary", eventId: existing.googleEventId })
    await prisma.calendarSync.delete({ where: { id: existing.id } })
  } catch (err) {
    console.error("[calendar-sync] deleteCalendarEvent failed", entityType, entityId, err)
  }
}

export async function fetchGoogleEvents(days: number, userId: string): Promise<GoogleCalendarEvent[]> {
  let client
  try {
    client = await getGoogleClient(userId)
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return []
    console.error("[calendar-sync] fetchGoogleEvents failed", err)
    return []
  }

  const calendar = google.calendar({ version: "v3", auth: client })
  const timeMin = new Date().toISOString()
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()

  try {
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
    })

    return (res.data.items ?? [])
      .filter(e => e.id && e.summary && (e.start?.date || e.start?.dateTime))
      .map(e => ({
        googleEventId: e.id!,
        title: e.summary!,
        date: e.start?.date ?? e.start?.dateTime?.split("T")[0] ?? "",
        calendarId: "primary",
      }))
  } catch (err) {
    console.error("[calendar-sync] fetchGoogleEvents failed", err)
    return []
  }
}
