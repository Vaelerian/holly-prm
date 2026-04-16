import {
  resolveEffortMinutes,
  calculateEffectiveImportance,
  importanceToSortOrder,
  urgencyToSortOrder,
  getDefaultSchedulingPrefs,
  type SchedulingPrefs,
} from "@/lib/services/scheduling-helpers"

const prefs: SchedulingPrefs = getDefaultSchedulingPrefs()

describe("resolveEffortMinutes", () => {
  it("uses effortMinutes override when present", () => {
    expect(resolveEffortMinutes({ effortMinutes: 45, effortSize: "hour" }, prefs)).toBe(45)
  })

  it("maps minutes size", () => {
    expect(resolveEffortMinutes({ effortMinutes: null, effortSize: "minutes" }, prefs)).toBe(20)
  })

  it("maps hour size", () => {
    expect(resolveEffortMinutes({ effortMinutes: null, effortSize: "hour" }, prefs)).toBe(90)
  })

  it("maps half_day size", () => {
    expect(resolveEffortMinutes({ effortMinutes: null, effortSize: "half_day" }, prefs)).toBe(240)
  })

  it("maps day size", () => {
    expect(resolveEffortMinutes({ effortMinutes: null, effortSize: "day" }, prefs)).toBe(480)
  })

  it("maps project_size to sizeDay * 2", () => {
    expect(resolveEffortMinutes({ effortMinutes: null, effortSize: "project_size" }, prefs)).toBe(960)
  })

  it("maps milestone to 0", () => {
    expect(resolveEffortMinutes({ effortMinutes: null, effortSize: "milestone" }, prefs)).toBe(0)
  })

  it("returns 0 for undefined_size", () => {
    expect(resolveEffortMinutes({ effortMinutes: null, effortSize: "undefined_size" }, prefs)).toBe(0)
  })

  it("returns 0 when both undefined", () => {
    expect(resolveEffortMinutes({ effortMinutes: null, effortSize: "undefined_size" }, prefs)).toBe(0)
  })

  it("effortMinutes of 0 still counts as override", () => {
    expect(resolveEffortMinutes({ effortMinutes: 0, effortSize: "hour" }, prefs)).toBe(0)
  })
})

describe("calculateEffectiveImportance", () => {
  it("promotes step to core with 'more'", () => {
    expect(calculateEffectiveImportance("step", "more")).toBe("core")
  })

  it("promotes bonus to step with 'more'", () => {
    expect(calculateEffectiveImportance("bonus", "more")).toBe("step")
  })

  it("core cannot promote further", () => {
    expect(calculateEffectiveImportance("core", "more")).toBe("core")
  })

  it("demotes core to step with 'less'", () => {
    expect(calculateEffectiveImportance("core", "less")).toBe("step")
  })

  it("demotes step to bonus with 'less'", () => {
    expect(calculateEffectiveImportance("step", "less")).toBe("bonus")
  })

  it("bonus cannot demote further", () => {
    expect(calculateEffectiveImportance("bonus", "less")).toBe("bonus")
  })

  it("same returns unchanged", () => {
    expect(calculateEffectiveImportance("step", "same")).toBe("step")
  })

  it("null projectImportance returns unchanged", () => {
    expect(calculateEffectiveImportance("core", null)).toBe("core")
  })

  it("undefined_imp stays regardless of project importance", () => {
    expect(calculateEffectiveImportance("undefined_imp", "more")).toBe("undefined_imp")
    expect(calculateEffectiveImportance("undefined_imp", "less")).toBe("undefined_imp")
  })
})

describe("importanceToSortOrder", () => {
  it("core = 1", () => expect(importanceToSortOrder("core")).toBe(1))
  it("step = 2", () => expect(importanceToSortOrder("step")).toBe(2))
  it("bonus = 3", () => expect(importanceToSortOrder("bonus")).toBe(3))
  it("undefined_imp = 99", () => expect(importanceToSortOrder("undefined_imp")).toBe(99))
})

describe("urgencyToSortOrder", () => {
  it("dated = 1", () => expect(urgencyToSortOrder("dated")).toBe(1))
  it("asap = 2", () => expect(urgencyToSortOrder("asap")).toBe(2))
  it("soon = 3", () => expect(urgencyToSortOrder("soon")).toBe(3))
  it("sometime = 4", () => expect(urgencyToSortOrder("sometime")).toBe(4))
  it("undefined_urg = 99", () => expect(urgencyToSortOrder("undefined_urg")).toBe(99))
})
