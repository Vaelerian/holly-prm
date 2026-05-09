import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { listGoals } from "@/lib/services/goals"
import { listProjects } from "@/lib/services/projects"
import { listTasks } from "@/lib/services/tasks"
import { listActionItems } from "@/lib/services/action-items"
import { startOfWeekMonday, weekLabel } from "@/lib/week"

interface CompletedRow {
  kind: "Goal" | "Project" | "Task" | "Action"
  id: string
  title: string
  context: string
  href: string
  completedAt: Date
}

function bucketByWeek(rows: CompletedRow[]): Map<number, CompletedRow[]> {
  const buckets = new Map<number, CompletedRow[]>()
  for (const row of rows) {
    const weekStart = startOfWeekMonday(row.completedAt).getTime()
    if (!buckets.has(weekStart)) buckets.set(weekStart, [])
    buckets.get(weekStart)!.push(row)
  }
  return new Map(Array.from(buckets.entries()).sort((a, b) => b[0] - a[0]))
}

const KIND_COLOUR: Record<CompletedRow["kind"], string> = {
  Goal: "#a855f7",
  Project: "#00ff88",
  Task: "#3b82f6",
  Action: "#f59e0b",
}

export default async function CompletedPage() {
  const session = await auth()
  if (!session?.userId) redirect("/login")
  const userId = session.userId

  const [goals, projects, tasks, actions] = await Promise.all([
    listGoals(userId, undefined, { completed: true }),
    listProjects({ userId, completed: true }),
    listTasks({ userId, completed: true }),
    listActionItems({ userId, completed: true }),
  ])

  const rows: CompletedRow[] = [
    ...goals
      .filter((g): g is typeof g & { completedAt: Date } => g.completedAt != null)
      .map((g) => ({
        kind: "Goal" as const,
        id: g.id,
        title: g.name,
        context: g.role?.name ?? "",
        href: `/goals`,
        completedAt: g.completedAt,
      })),
    ...projects
      .filter((p): p is typeof p & { completedAt: Date } => p.completedAt != null)
      .map((p) => ({
        kind: "Project" as const,
        id: p.id,
        title: p.title,
        context: [p.role?.name, p.goal?.name].filter(Boolean).join(" / "),
        href: `/projects/${p.id}`,
        completedAt: p.completedAt,
      })),
    ...tasks
      .filter((t): t is typeof t & { completedAt: Date } => t.completedAt != null)
      .map((t) => ({
        kind: "Task" as const,
        id: t.id,
        title: t.title,
        context: [t.role?.name, t.goal?.name, t.project?.title].filter(Boolean).join(" / "),
        href: `/tasks/${t.id}/edit`,
        completedAt: t.completedAt,
      })),
    ...actions
      .filter((a): a is typeof a & { completedAt: Date } => a.completedAt != null)
      .map((a) => ({
        kind: "Action" as const,
        id: a.id,
        title: a.title,
        context: a.assignedTo,
        href: `/contacts`,
        completedAt: a.completedAt,
      })),
  ]

  const buckets = bucketByWeek(rows)

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#c0c0d0]">Completed</h1>
        <span className="text-xs text-[#666688]">
          Items completed this week stay on the active lists. Earlier items live here.
        </span>
      </div>

      {buckets.size === 0 ? (
        <p className="text-sm text-[#666688]">Nothing has been completed yet.</p>
      ) : (
        <div className="space-y-6">
          {Array.from(buckets.entries()).map(([weekTs, weekRows]) => (
            <section key={weekTs}>
              <h2 className="text-sm font-semibold text-[#c0c0d0] mb-2">
                {weekLabel(new Date(weekTs))}
                <span className="ml-2 text-xs text-[#666688]">
                  {weekRows.length} item{weekRows.length === 1 ? "" : "s"}
                </span>
              </h2>
              <div className="space-y-1.5 ml-2">
                {weekRows.map((row) => (
                  <div
                    key={`${row.kind}-${row.id}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: KIND_COLOUR[row.kind] }}
                      title={row.kind}
                    />
                    <span className="text-[10px] uppercase tracking-wide text-[#666688] w-14 flex-shrink-0">
                      {row.kind}
                    </span>
                    <Link
                      href={row.href}
                      className="text-sm text-[#c0c0d0] hover:text-[#00ff88] flex-1 min-w-0 break-words"
                    >
                      {row.title}
                    </Link>
                    {row.context && (
                      <span className="text-xs text-[#666688] truncate">{row.context}</span>
                    )}
                    <span className="text-xs text-[#666688] flex-shrink-0">
                      {row.completedAt.toLocaleDateString("en-GB", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
