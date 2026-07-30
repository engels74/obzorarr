const MAX_ERROR_DETAIL_LENGTH = 1_000;
const MAX_ERROR_BODY_BYTES = 16_384;

export function buildCompletionOptions(
	model: string,
	maxTokens: number,
	temperature?: number
): { max_tokens: number; temperature?: number } | { max_completion_tokens: number } {
	// GPT-5 and o-series models reject the legacy max_tokens parameter. They also
	// do not support non-default temperature values on Chat Completions.
	if (/(?:^|\/)(?:gpt-5|o\d)(?:[.-]|$)/i.test(model)) {
		return { max_completion_tokens: maxTokens };
	}

	return {
		...(temperature === undefined ? {} : { temperature }),
		max_tokens: maxTokens
	};
}

export async function readOpenAIErrorDetail(response: Response): Promise<string | null> {
	const body = (await readBoundedResponseText(response)).trim();
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

async function readBoundedResponseText(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) {
		return (await response.text().catch(() => '')).slice(0, MAX_ERROR_BODY_BYTES);
	}

	const decoder = new TextDecoder();
	let body = '';
	let bytesRead = 0;

	try {
		while (bytesRead < MAX_ERROR_BODY_BYTES) {
			const { done, value } = await reader.read();
			if (done) return body + decoder.decode();

			const remaining = MAX_ERROR_BODY_BYTES - bytesRead;
			const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
			body += decoder.decode(chunk, { stream: true });
			bytesRead += chunk.byteLength;

			if (bytesRead === MAX_ERROR_BODY_BYTES) {
				await reader.cancel().catch(() => undefined);
				return body + decoder.decode();
			}
		}
	} catch {
		await reader.cancel().catch(() => undefined);
		return '';
	}

	return body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
