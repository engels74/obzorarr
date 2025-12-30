const ERROR_MESSAGE_MAP: Record<string, string> = {
	econnrefused: 'Unable to connect to server',
	enotfound: 'Server not found',
	etimedout: 'Connection timed out',
	econnreset: 'Connection was reset',
	ehostunreach: 'Host unreachable',
	enetunreach: 'Network unreachable',
	certificate: 'SSL certificate error',
	cert: 'SSL certificate error',
	ssl: 'SSL/TLS error',
	tls: 'SSL/TLS error',
	socket: 'Connection error',
	epipe: 'Connection closed unexpectedly'
};

export function sanitizeConnectionError(error: unknown): string {
	if (!(error instanceof Error)) {
		return 'Connection failed';
	}

	const message = error.message.toLowerCase();

	for (const [key, safeMessage] of Object.entries(ERROR_MESSAGE_MAP)) {
		if (message.includes(key)) {
			return safeMessage;
		}
	}

	return 'Connection failed';
}

export function classifyConnectionError(error: Error): string {
	if (error.name === 'AbortError') {
		return 'Connection timed out - the server may be unreachable';
	}

	const message = error.message;

	if (
		message.includes('certificate') ||
		message.includes('SSL') ||
		message.includes('TLS')
	) {
		return 'SSL certificate error - check your server configuration';
	}

	if (
		message.includes('ENOTFOUND') ||
		message.includes('ECONNREFUSED') ||
		message.includes('getaddrinfo')
	) {
		return 'Could not connect to server - check the URL and ensure the server is reachable';
	}

	return sanitizeConnectionError(error);
}

export function sanitizeApiError(error: unknown): string {
	if (!(error instanceof Error)) {
		return 'An error occurred';
	}

	const message = error.message.toLowerCase();

	if (message.includes('unauthorized') || message.includes('401')) {
		return 'Authentication failed';
	}

	if (message.includes('forbidden') || message.includes('403')) {
		return 'Access denied';
	}

	if (message.includes('not found') || message.includes('404')) {
		return 'Resource not found';
	}

	if (message.includes('timeout')) {
		return 'Request timed out';
	}

	return 'An error occurred';
}
