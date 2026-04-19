const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-5-mini';
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

	const resolvedBaseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
	const resolvedModel = model ?? DEFAULT_MODEL;

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
				max_tokens: 1
			}),
			signal: controller.signal
		});

		if (response.ok) {
			return { success: true, message: `Connected (model: ${resolvedModel})` };
		}

		if (response.status === 401) {
			return { success: false, error: 'Authentication failed — check your API key' };
		}
		if (response.status === 404) {
			return { success: false, error: 'Model not found or base URL is incorrect' };
		}
		return {
			success: false,
			error: `Request failed: ${response.status} ${response.statusText}`
		};
	} catch (error) {
		if ((error as Error).name === 'AbortError') {
			return { success: false, error: 'Connection timed out' };
		}
		return { success: false, error: (error as Error).message };
	} finally {
		clearTimeout(timeoutId);
	}
}
