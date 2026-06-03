/**
 * Shared watch-time formatting helpers.
 *
 * Both the admin dashboard ("Hours Watched" stat) and the Wrapped
 * "Total Time" slide derive an hours figure from the same source field
 * (`totalWatchTimeMinutes`, in minutes). They previously disagreed because
 * the dashboard rounded (`Math.round`) while the slide floored
 * (`Math.floor`), so the same user/year could show e.g. 100h vs 99h
 * (ISSUE-011). This is the single rounding authority for that conversion.
 */

/**
 * Convert a watch-time duration in minutes to whole hours.
 *
 * Rounds to the nearest hour so both surfaces report an identical figure
 * for the same input.
 */
export function formatWatchHours(minutes: number): number {
	if (!Number.isFinite(minutes) || minutes <= 0) return 0;
	return Math.round(minutes / 60);
}
