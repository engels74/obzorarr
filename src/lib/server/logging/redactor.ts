const REDACTED = '<redacted>';

const SENSITIVE_QUERY_PARAM =
	/([?&](?:token|access_token|auth_token|api_key|apikey|key|x-plex-token)=)[^&#\s"'`]+/gi;
const URL_USERINFO = /\b(https?:\/\/)[^\s/@:]+(?::[^\s/@]*)?@/gi;
const HEADER_OR_FIELD_SECRET =
	/\b((?:X-Plex-Token|plexToken|apiKey|accessToken|authToken)\s*[:=]\s*)[^\s,;}"'`]+/gi;
const AUTHORIZATION_HEADER = /\b(Authorization\s*[:=]\s*)(?:Bearer|Basic)?\s*[^\s,;}"'`]+/gi;
const COOKIE_HEADER = /\b((?:Cookie|Set-Cookie)\s*[:=]\s*)[^\n]+/gi;
const JSON_SECRET =
	/(["'](?:X-Plex-Token|Authorization|Cookie|Set-Cookie|plexToken|apiKey|accessToken|authToken)["']\s*:\s*["'])[^"']+(["'])/gi;

export function redactLogMessage(message: string): string {
	return message
		.replace(URL_USERINFO, `$1${REDACTED}@`)
		.replace(SENSITIVE_QUERY_PARAM, `$1${REDACTED}`)
		.replace(JSON_SECRET, `$1${REDACTED}$2`)
		.replace(AUTHORIZATION_HEADER, `$1${REDACTED}`)
		.replace(COOKIE_HEADER, `$1${REDACTED}`)
		.replace(HEADER_OR_FIELD_SECRET, `$1${REDACTED}`);
}

export function redactLogMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(metadata).map(([key, value]) => [key, redactMetadataValue(value)])
	);
}

function redactMetadataValue(value: unknown): unknown {
	if (typeof value === 'string') return redactLogMessage(value);
	if (Array.isArray(value)) return value.map(redactMetadataValue);
	if (value && typeof value === 'object') {
		return redactLogMetadata(value as Record<string, unknown>);
	}
	return value;
}
