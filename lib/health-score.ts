export function computeHealthScore(
  lastInteraction: Date | null,
  freqDays: number | null
): number {
  if (!freqDays || !lastInteraction) return 100
  const daysSince = Math.floor(
    (Date.now() - lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysSince <= freqDays) return 100
  const overdueDays = daysSince - freqDays
  const penalty = Math.min(overdueDays / freqDays, 1) * 100
  return Math.max(0, Math.round(100 - penalty))
}
