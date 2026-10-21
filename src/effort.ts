/**
 * Km effort, the unit mountain races use to compare courses: every 100 m of positive elevation counts as 1 km.
 * 20 km with 1,000 m D+ → 20 + 10 = 30 km effort. Missing values count as 0.
 */
export function kmEffort(distanceM: number | null | undefined, elevationGainM: number | null | undefined): number {
  return (distanceM ?? 0) / 1000 + (elevationGainM ?? 0) / 100;
}
