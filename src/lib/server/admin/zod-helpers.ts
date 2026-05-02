import { z } from 'zod';

/**
 * Optional string that trims surrounding whitespace and treats empty-after-trim
 * as `undefined`. Use for free-text settings inputs (API keys, model names,
 * server names) where a whitespace-only submission should not be persisted as a
 * meaningful value — it would silently break downstream API calls otherwise.
 */
export function optionalTrimmed(maxLen: number) {
	return z
		.string()
		.max(maxLen)
		.optional()
		.transform((s) => {
			if (s == null) return undefined;
			const trimmed = s.trim();
			return trimmed === '' ? undefined : trimmed;
		});
}
