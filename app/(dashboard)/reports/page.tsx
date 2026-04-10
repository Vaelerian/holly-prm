import { getHealthAnalytics, getVelocityAnalytics, getCompletionAnalytics } from "@/lib/services/analytics"

interface PageProps {
  searchParams: Promise<{ days?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const { days: daysParam } = await searchParams
  const days = Math.min(365, Math.max(7, parseInt(daysParam ?? "30", 10) || 30))

  let health: Awaited<ReturnType<typeof getHealthAnalytics>> | null = null
  let velocity: Awaited<ReturnType<typeof getVelocityAnalytics>> | null = null
  let completion: Awaited<ReturnType<typeof getCompletionAnalytics>> | null = null
  let dbError = false

  try {
    ;[health, velocity, completion] = await Promise.all([
      getHealthAnalytics(days),
      getVelocityAnalytics(days),
      getCompletionAnalytics(days),
    ])
  } catch (e) {
    console.error("[reports page]", e)
    dbError = true
  }

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Reports</h1>
        <form className="flex items-center gap-2">
          <label className="text-sm text-[#666688]">Window:</label>
          <select
            name="days"
            defaultValue={String(days)}
            className="border border-[rgba(0,255,136,0.2)] rounded-lg px-3 py-1.5 text-sm bg-[#0a0a1a] text-[#c0c0d0] focus:outline-none"
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 365 days</option>
          </select>
          <button
            type="submit"
            className="bg-[rgba(0,255,136,0.05)] border border-[rgba(0,255,136,0.2)] text-[#c0c0d0] text-sm px-3 py-1.5 rounded-lg hover:bg-[rgba(0,255,136,0.08)]"
          >
            Apply
          </button>
        </form>
      </div>

      {dbError && (
        <div className="bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-3 text-sm text-red-400">
          Database unavailable. Check server logs.
        </div>
      )}

      {health && (
        <section>
          <h2 className="text-base font-semibold text-[#c0c0d0] mb-3">Relationship Health</h2>
          {health.contacts.length === 0 ? (
            <p className="text-sm text-[#666688]">No contacts with frequency targets set.</p>
          ) : (
            <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(0,255,136,0.15)]">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Contact</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Score</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Trend</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Days Since</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {health.contacts.map((c, i) => (
                    <tr key={c.id} className={i < health!.contacts.length - 1 ? "border-b border-[rgba(0,255,136,0.08)]" : ""}>
                      <td className="px-4 py-2.5 text-[#c0c0d0] font-medium">{c.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`font-medium ${c.currentScore >= 70 ? "text-[#00ff88]" : c.currentScore >= 40 ? "text-yellow-400" : "text-red-400"}`}>
                          {c.currentScore}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#666688]">
                        {c.trend === "improving" && <span className="text-[#00ff88]">up</span>}
                        {c.trend === "declining" && <span className="text-red-400">down</span>}
                        {c.trend === "stable" && <span className="text-[#666688]">stable</span>}
                        {c.trend === "insufficient_data" && <span className="text-[#444466]">-</span>}
                      </td>
                      <td className="px-4 py-2.5 text-[#666688]">
                        {c.daysSinceLastInteraction !== null ? `${c.daysSinceLastInteraction}d` : "never"}
                      </td>
                      <td className="px-4 py-2.5 text-[#666688]">{c.frequencyTargetDays}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {velocity && (
        <section>
          <h2 className="text-base font-semibold text-[#c0c0d0] mb-3">Project Velocity</h2>
          {velocity.projects.length === 0 ? (
            <p className="text-sm text-[#666688]">No active projects.</p>
          ) : (
            <div className="space-y-3">
              {velocity.projects.map(p => {
                const pct = p.tasksTotal > 0 ? Math.round((p.tasksCompleted / p.tasksTotal) * 100) : 0
                return (
                  <div key={p.id} className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-[#c0c0d0]">{p.title}</p>
                      <span className="text-xs text-[#666688]">{p.tasksCompleted}/{p.tasksTotal} tasks</span>
                    </div>
                    <div className="w-full bg-[#0a0a1a] rounded-full h-1.5 mb-2">
                      <div
                        className="bg-[#00ff88] h-1.5 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#666688]">
                      <span>{p.weeklyRate} tasks/week</span>
                      {p.projectedCompletionDate ? (
                        <span>Est. done {p.projectedCompletionDate}</span>
                      ) : (
                        <span>No completion estimate</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {completion && (
        <section>
          <h2 className="text-base font-semibold text-[#c0c0d0] mb-3">Action Item Completion</h2>
          <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(0,255,136,0.15)]">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Person</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Completion Rate</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[rgba(0,255,136,0.08)]">
                  <td className="px-4 py-2.5 text-[#c0c0d0]">Ian</td>
                  <td className="px-4 py-2.5 text-[#00ff88] font-medium">{Math.round(completion.rates.ian * 100)}%</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-[#c0c0d0]">Holly</td>
                  <td className="px-4 py-2.5 text-[#00ff88] font-medium">{Math.round(completion.rates.holly * 100)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-semibold text-[#666688] uppercase tracking-wide mb-2">Week by Week</h3>
          <div className="bg-[#111125] border border-[rgba(0,255,136,0.15)] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[rgba(0,255,136,0.15)]">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Week</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Ian</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#666688] uppercase tracking-wide">Holly</th>
                </tr>
              </thead>
              <tbody>
                {completion.byWeek.map((w, i) => (
                  <tr key={w.weekStart} className={i < completion!.byWeek.length - 1 ? "border-b border-[rgba(0,255,136,0.08)]" : ""}>
                    <td className="px-4 py-2.5 text-[#666688]">{w.weekStart}</td>
                    <td className="px-4 py-2.5 text-[#c0c0d0]">{w.ian}</td>
                    <td className="px-4 py-2.5 text-[#c0c0d0]">{w.holly}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
