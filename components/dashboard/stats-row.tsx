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
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-red-700">{overdueCount}</span>
          <span className="text-red-600 ml-1">contacts overdue</span>
        </div>
      )}
      {followUpCount > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-yellow-700">{followUpCount}</span>
          <span className="text-yellow-600 ml-1">follow-ups pending</span>
        </div>
      )}
      {actionCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-blue-700">{actionCount}</span>
          <span className="text-blue-600 ml-1">open actions</span>
        </div>
      )}
      {openProjectsCount > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-purple-700">{openProjectsCount}</span>
          <span className="text-purple-600 ml-1">open projects</span>
        </div>
      )}
      {tasksDueTodayCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-sm">
          <span className="font-bold text-orange-700">{tasksDueTodayCount}</span>
          <span className="text-orange-600 ml-1">tasks due today</span>
        </div>
      )}
      {overdueCount === 0 && followUpCount === 0 && actionCount === 0 && openProjectsCount === 0 && tasksDueTodayCount === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700">
          All caught up
        </div>
      )}
    </div>
  )
}
