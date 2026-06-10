/**
 * Parse a `#slide=N` location hash into a clamped slide index.
 *
 * Pure parse + clamp only — no navigation, timing, or browser-API access — so it
 * can run during SSR, in `afterNavigate`, and in unit tests identically. A
 * non-matching hash (or one whose number is NaN) yields 0; an in-range number is
 * clamped to `[0, slideCount - 1]`.
 */
export function parseSlideHash(hash: string, slideCount: number): number {
	const match = /^#slide=(\d+)$/.exec(hash);
	if (!match) return 0;
	const parsed = Number.parseInt(match[1]!, 10);
	if (Number.isNaN(parsed)) return 0;
	const max = Math.max(0, slideCount - 1);
	return Math.min(Math.max(parsed, 0), max);
}
