export function applySecurityHeaders(response: Response, request: Request): Response {
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	// Content-Security-Policy is managed by SvelteKit's kit.csp (svelte.config.js)
	// using nonce mode, which eliminates the need for 'unsafe-inline' on script-src.

	const isHttps =
		new URL(request.url).protocol === 'https:' ||
		request.headers.get('x-forwarded-proto')?.includes('https');
	if (isHttps) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
}
