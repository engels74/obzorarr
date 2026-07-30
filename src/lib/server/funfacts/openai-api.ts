const MAX_ERROR_DETAIL_LENGTH = 1_000;

export function buildCompletionOptions(
	model: string,
	maxTokens: number,
	temperature?: number
): { max_tokens: number; temperature?: number } | { max_completion_tokens: number } {
	// GPT-5 and o-series models reject the legacy max_tokens parameter. They also
	// do not support non-default temperature values on Chat Completions.
	if (/^(?:gpt-5|o\d)(?:[.-]|$)/i.test(model)) {
		return { max_completion_tokens: maxTokens };
	}

	return {
		...(temperature === undefined ? {} : { temperature }),
		max_tokens: maxTokens
	};
}

export async function readOpenAIErrorDetail(response: Response): Promise<string | null> {
	const body = (await response.text().catch(() => '')).trim();
	if (!body) return null;

	let detail = body;
	try {
		const parsed: unknown = JSON.parse(body);
		if (isRecord(parsed)) {
			if (isRecord(parsed.error) && typeof parsed.error.message === 'string') {
				detail = parsed.error.message;
			} else if (typeof parsed.message === 'string') {
				detail = parsed.message;
			}
		}
	} catch {
		// Plain-text upstream errors are already useful as-is.
	}

	const normalized = detail.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	if (normalized.length <= MAX_ERROR_DETAIL_LENGTH) return normalized;
	return `${normalized.slice(0, MAX_ERROR_DETAIL_LENGTH - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
