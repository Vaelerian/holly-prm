import {
  expandPattern,
  isValidInstanceDate,
  toDateStr,
  type RepeatPatternData,
  type RepeatExceptionData,
} from "@/lib/services/repeat-expand"

function makePattern(overrides: Partial<RepeatPatternData> = {}): RepeatPatternData {
  return {
    id: "pat-1",
    roleId: "role-1",
    repeatType: "daily",
    intervalValue: 1,
    startDate: new Date(Date.UTC(2025, 0, 1)), // 2025-01-01
    endDate: null,
    dayPattern: {},
    startMinutes: 480, // 8:00
    endMinutes: 600,   // 10:00
    title: "Morning block",
    userId: "user-1",
    ...overrides,
  }
}

function d(dateStr: string): Date {
  const [y, m, day] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

describe("toDateStr", () => {
  it("formats a date as YYYY-MM-DD", () => {
    expect(toDateStr(new Date(Date.UTC(2025, 0, 5)))).toBe("2025-01-05")
    expect(toDateStr(new Date(Date.UTC(2025, 11, 31)))).toBe("2025-12-31")
  })
})

describe("expandPattern - daily", () => {
  it("generates correct dates for every day", () => {
    const pattern = makePattern()
    const slots = expandPattern(pattern, d("2025-01-01"), d("2025-01-05"))

    expect(slots).toHaveLength(5)
    expect(slots.map(s => s.date)).toEqual([
      "2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04", "2025-01-05",
    ])
  })

  it("respects interval (every 2 days)", () => {
    const pattern = makePattern({ intervalValue: 2 })
    const slots = expandPattern(pattern, d("2025-01-01"), d("2025-01-10"))

    expect(slots.map(s => s.date)).toEqual([
      "2025-01-01", "2025-01-03", "2025-01-05", "2025-01-07", "2025-01-09",
    ])
  })

  it("respects endDate", () => {
    const pattern = makePattern({ endDate: d("2025-01-03") })
    const slots = expandPattern(pattern, d("2025-01-01"), d("2025-01-10"))

    expect(slots).toHaveLength(3)
    expect(slots[2].date).toBe("2025-01-03")
  })

  it("sets correct virtual slot fields", () => {
    const pattern = makePattern()
    const slots = expandPattern(pattern, d("2025-01-01"), d("2025-01-01"))

    expect(slots).toHaveLength(1)
    const slot = slots[0]
    expect(slot.startMinutes).toBe(480)
    expect(slot.endMinutes).toBe(600)
    expect(slot.capacityMinutes).toBe(120)
    expect(slot.usedMinutes).toBe(0)
    expect(slot.taskCount).toBe(0)
    expect(slot.isVirtual).toBe(true)
    expect(slot.repeatPatternId).toBe("pat-1")
    expect(slot.title).toBe("Morning block")
  })
})

describe("expandPattern - weekly", () => {
  it("generates on specified weekdays (Mon/Wed/Fri)", () => {
    const pattern = makePattern({
      repeatType: "weekly",
      startDate: d("2025-01-06"), // Monday
      dayPattern: { days: [1, 3, 5] }, // Mon, Wed, Fri
    })
    // 2025-01-06 is Monday
    const slots = expandPattern(pattern, d("2025-01-06"), d("2025-01-12"))

    expect(slots.map(s => s.date)).toEqual([
      "2025-01-06", // Mon
      "2025-01-08", // Wed
      "2025-01-10", // Fri
    ])
  })

  it("handles bi-weekly interval", () => {
    const pattern = makePattern({
      repeatType: "weekly",
      intervalValue: 2,
      startDate: d("2025-01-06"), // Monday
      dayPattern: { days: [1] }, // Monday only
    })
    const slots = expandPattern(pattern, d("2025-01-06"), d("2025-02-03"))

    expect(slots.map(s => s.date)).toEqual([
      "2025-01-06",
      "2025-01-20",
      "2025-02-03",
    ])
  })
})

describe("expandPattern - monthly_by_date", () => {
  it("generates on specific dates each month", () => {
    const pattern = makePattern({
      repeatType: "monthly_by_date",
      startDate: d("2025-01-15"),
      dayPattern: { dates: [15] },
    })
    const slots = expandPattern(pattern, d("2025-01-01"), d("2025-04-30"))

    expect(slots.map(s => s.date)).toEqual([
      "2025-01-15", "2025-02-15", "2025-03-15", "2025-04-15",
    ])
  })

  it("skips months without that date (Feb 30)", () => {
    const pattern = makePattern({
      repeatType: "monthly_by_date",
      startDate: d("2025-01-30"),
      dayPattern: { dates: [30] },
    })
    const slots = expandPattern(pattern, d("2025-01-01"), d("2025-04-30"))

    // Feb has no 30th, so should be skipped
    expect(slots.map(s => s.date)).toEqual([
      "2025-01-30", "2025-03-30", "2025-04-30",
    ])
  })
})

describe("expandPattern - exceptions", () => {
  it("skipped dates are removed", () => {
    const pattern = makePattern()
    const exceptions: RepeatExceptionData[] = [
      {
        id: "ex-1",
        repeatPatternId: "pat-1",
        exceptionDate: d("2025-01-03"),
        exceptionType: "skipped",
        modifiedStartMinutes: null,
        modifiedEndMinutes: null,
        modifiedTitle: null,
      },
    ]
    const slots = expandPattern(pattern, d("2025-01-01"), d("2025-01-05"), exceptions)

    expect(slots).toHaveLength(4)
    expect(slots.map(s => s.date)).not.toContain("2025-01-03")
  })

  it("modified dates have overridden fields", () => {
    const pattern = makePattern()
    const exceptions: RepeatExceptionData[] = [
      {
        id: "ex-2",
        repeatPatternId: "pat-1",
        exceptionDate: d("2025-01-02"),
        exceptionType: "modified",
        modifiedStartMinutes: 540,
        modifiedEndMinutes: 660,
        modifiedTitle: "Late start",
      },
    ]
    const slots = expandPattern(pattern, d("2025-01-01"), d("2025-01-03"), exceptions)

    const modifiedSlot = slots.find(s => s.date === "2025-01-02")!
    expect(modifiedSlot.startMinutes).toBe(540)
    expect(modifiedSlot.endMinutes).toBe(660)
    expect(modifiedSlot.capacityMinutes).toBe(120)
    expect(modifiedSlot.title).toBe("Late start")
  })
})

describe("virtual ID format", () => {
  it("uses rp:{patternId}:{date} format", () => {
    const pattern = makePattern({ id: "abc-123" })
    const slots = expandPattern(pattern, d("2025-01-01"), d("2025-01-01"))

    expect(slots[0].id).toBe("rp:abc-123:2025-01-01")
  })
})

describe("isValidInstanceDate", () => {
  it("returns true for a valid daily instance date", () => {
    const pattern = makePattern({ intervalValue: 2 })
    // startDate is 2025-01-01, interval 2 -> 01-01, 01-03, 01-05 ...
    expect(isValidInstanceDate(pattern, d("2025-01-03"))).toBe(true)
    expect(isValidInstanceDate(pattern, d("2025-01-05"))).toBe(true)
  })

  it("returns false for a date before start", () => {
    const pattern = makePattern()
    expect(isValidInstanceDate(pattern, d("2024-12-31"))).toBe(false)
  })

  it("returns false for a wrong interval day", () => {
    const pattern = makePattern({ intervalValue: 3 })
    // 2025-01-01 + 3 = 01-04, 01-07, ...
    expect(isValidInstanceDate(pattern, d("2025-01-02"))).toBe(false)
    expect(isValidInstanceDate(pattern, d("2025-01-03"))).toBe(false)
  })

  it("returns true for a valid weekly instance", () => {
    const pattern = makePattern({
      repeatType: "weekly",
      startDate: d("2025-01-06"), // Monday
      dayPattern: { days: [1, 5] }, // Mon, Fri
    })
    expect(isValidInstanceDate(pattern, d("2025-01-10"))).toBe(true) // Friday
    expect(isValidInstanceDate(pattern, d("2025-01-08"))).toBe(false) // Wednesday
  })
})
