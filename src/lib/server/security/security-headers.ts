import { dev } from '$app/environment';

const CSP_DIRECTIVES = [
	"default-src 'self'",
	"img-src 'self' https://plex.tv https://*.plex.direct data:",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"font-src 'self' https://fonts.gstatic.com",
	"script-src 'self' 'unsafe-inline'",
	"connect-src 'self' https://plex.tv",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'"
].join('; ');

export function applySecurityHeaders(response: Response, request: Request): Response {
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	if (!dev) {
		response.headers.set('Content-Security-Policy', CSP_DIRECTIVES);
	}

	const isHttps =
		new URL(request.url).protocol === 'https:' ||
		request.headers.get('x-forwarded-proto')?.includes('https');
	if (isHttps) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	return response;
}
