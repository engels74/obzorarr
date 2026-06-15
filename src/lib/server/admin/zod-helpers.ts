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

/**
 * Characters rejected in an OpenAI model name (ISSUE-001). Deliberately a NARROW
 * REJECT-LIST, not a charset allow-list — control characters (`\x00-\x1f`) and
 * shell metacharacters (`` ! $ ` ; | & < > ( ) { } * ? ' " \ ``). Everything
 * else — letters, digits, `.` `_` `-` `:` `/` AND internal spaces — is permitted,
 * because local/aliased model names legitimately contain spaces and provider
 * slugs (e.g. `meta-llama/Llama-3.1-8B:free`, `My Local Model 7B`).
 *
 * False-accept rationale: a bad/typo'd model degrades gracefully to the built-in
 * template generator (AI fun facts simply fall back), so over-REJECTING is
 * strictly worse than over-accepting — rejecting a valid exotic id blocks a
 * working config, whereas accepting a bad id merely falls back to templates.
 * Hence the lean: reject only clearly-malicious/garbage input.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control-char reject
const OPENAI_MODEL_REJECT = /[\x00-\x1f!$`;|&<>(){}*?'"\\]/;

export const OPENAI_MODEL_REJECT_MESSAGE =
	'Model name contains invalid characters (control or shell metacharacters are not allowed)';

/**
 * Validates the free-text OpenAI model field (ISSUE-001). Accepts the empty
 * string (intentional clear-to-default — DO NOT add `.min(1)`) and `undefined`
 * (field absent, e.g. a Plex-only save). For a NON-EMPTY value it enforces the
 * narrow {@link OPENAI_MODEL_REJECT} reject-list. Keeps `.trim()` + `.max(100)`.
 */
export function openaiModelOrEmpty() {
	return z
		.string()
		.trim()
		.max(100)
		.optional()
		.refine((s) => s == null || s === '' || !OPENAI_MODEL_REJECT.test(s), {
			message: OPENAI_MODEL_REJECT_MESSAGE
		});
}
