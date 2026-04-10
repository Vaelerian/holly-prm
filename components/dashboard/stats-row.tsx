interface StatsRowProps {
  overdueCount: number
  followUpCount: number
  actionCount: number
  openProjectsCount: number
  tasksDueTodayCount: number
}

export function StatsRow({ overdueCount, followUpCount, actionCount, openProjectsCount, tasksDueTodayCount }: StatsRowProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      {overdueCount > 0 && (
        <div className="bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.25)] rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-red-400">{overdueCount}</span>
          <span className="text-red-400 ml-1">contacts overdue</span>
        </div>
      )}
      {followUpCount > 0 && (
        <div className="bg-[rgba(255,200,0,0.08)] border border-[rgba(255,200,0,0.2)] rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-yellow-300">{followUpCount}</span>
          <span className="text-yellow-300 ml-1">follow-ups pending</span>
        </div>
      )}
      {actionCount > 0 && (
        <div className="bg-[rgba(0,160,255,0.08)] border border-[rgba(0,160,255,0.2)] rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-blue-300">{actionCount}</span>
          <span className="text-blue-300 ml-1">open actions</span>
        </div>
      )}
      {openProjectsCount > 0 && (
        <div className="bg-[rgba(160,0,255,0.08)] border border-[rgba(160,0,255,0.2)] rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-purple-300">{openProjectsCount}</span>
          <span className="text-purple-300 ml-1">open projects</span>
        </div>
      )}
      {tasksDueTodayCount > 0 && (
        <div className="bg-[rgba(255,140,0,0.08)] border border-[rgba(255,140,0,0.2)] rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-orange-300">{tasksDueTodayCount}</span>
          <span className="text-orange-300 ml-1">tasks due today</span>
        </div>
      )}
      {overdueCount === 0 && followUpCount === 0 && actionCount === 0 && openProjectsCount === 0 && tasksDueTodayCount === 0 && (
        <div className="bg-[rgba(0,255,136,0.08)] border border-[rgba(0,255,136,0.25)] rounded-lg px-4 py-2 text-sm text-[#00ff88]">
          All caught up
        </div>
      )}
    </div>
  )
}
