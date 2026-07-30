import {
	CredentialedUrlError,
	normalizeOpenAIBaseUrl
} from '$lib/server/security/credentialed-url';
import { buildCompletionOptions, readOpenAIErrorDetail } from './openai-api';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 10_000;

export type TestOpenAIConnectionResult =
	| { success: true; message: string }
	| { success: false; error: string };

export async function testOpenAIConnection(
	apiKey: string,
	baseUrl?: string,
	model?: string
): Promise<TestOpenAIConnectionResult> {
	const trimmedKey = apiKey.trim();
	if (!trimmedKey) {
		return { success: false, error: 'API key is required' };
	}

	let resolvedBaseUrl: string;
	try {
		resolvedBaseUrl = normalizeOpenAIBaseUrl(baseUrl?.trim() || DEFAULT_BASE_URL);
	} catch (err) {
		return {
			success: false,
			error: err instanceof CredentialedUrlError ? err.message : 'Invalid OpenAI base URL'
		};
	}
	const resolvedModel = model?.trim() || DEFAULT_MODEL;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const response = await fetch(`${resolvedBaseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${trimmedKey}`
			},
			body: JSON.stringify({
				model: resolvedModel,
				messages: [{ role: 'user', content: 'ping' }],
				...buildCompletionOptions(resolvedModel, 1)
			}),
			signal: controller.signal
		});

		if (response.ok) {
			return { success: true, message: `Connected (model: ${resolvedModel})` };
		}

		const detail = await readOpenAIErrorDetail(response);
		if (response.status === 401) {
			return {
				success: false,
				error: appendErrorDetail('Authentication failed — check your API key', detail)
			};
		}
		if (response.status === 404) {
			return {
				success: false,
				error: appendErrorDetail('Model not found or base URL is incorrect', detail)
			};
		}

		const status = `${response.status} ${response.statusText}`.trim();
		return {
			success: false,
			error: appendErrorDetail(`Request failed: ${status}`, detail)
		};
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			return { success: false, error: 'Connection timed out' };
		}
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error)
		};
	} finally {
		clearTimeout(timeoutId);
	}
}

function appendErrorDetail(message: string, detail: string | null): string {
	return detail ? `${message} — ${detail}` : message;
}
