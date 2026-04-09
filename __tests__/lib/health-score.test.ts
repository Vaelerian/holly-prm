import { computeHealthScore } from "@/lib/health-score"

describe("computeHealthScore", () => {
  it("returns 100 when no frequency threshold is set", () => {
    expect(computeHealthScore(new Date(), null)).toBe(100)
  })

  it("returns 100 when no interaction has occurred", () => {
    expect(computeHealthScore(null, 30)).toBe(100)
  })

  it("returns 100 when within frequency window", () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
    expect(computeHealthScore(recent, 30)).toBe(100)
  })

  it("returns 50 when overdue by half a period", () => {
    const lastContact = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000) // 45 days ago
    const score = computeHealthScore(lastContact, 30) // 15 days overdue, freqDays=30
    expect(score).toBe(50)
  })

  it("returns 0 when overdue by a full period or more", () => {
    const lastContact = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000) // 61 days ago
    expect(computeHealthScore(lastContact, 30)).toBe(0)
  })
})
