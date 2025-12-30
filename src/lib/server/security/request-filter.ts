import type { Handle } from '@sveltejs/kit';
import { logger } from '$lib/server/logging';

const BLOCKED_PATH_PATTERNS = [
	/^\/\.env/i,
	/^\/\.git/i,
	/^\/\.svn/i,
	/^\/\.htaccess/i,
	/^\/wp-/i,
	/^\/wordpress/i,
	/^\/xmlrpc\.php/i,
	/^\/phpmyadmin/i,
	/^\/adminer/i,
	/^\/admin\.php/i,
	/^\/config\.php/i,
	/^\/setup\.php/i,
	/^\/install\.php/i,
	/^\/_next\//i,
	/^\/api\/action[s]?$/i,
	/^\/actuator/i,
	/^\/debug\//i,
	/^\/console/i,
	/^\/manager/i,
	/^\/phpinfo/i,
	/^\/cgi-bin/i,
	/^\/\.well-known\/security\.txt/i
];

const BLOCKED_USER_AGENT_PATTERNS = [
	/zgrab/i,
	/nuclei/i,
	/nmap/i,
	/nikto/i,
	/sqlmap/i,
	/masscan/i,
	/gobuster/i,
	/dirbuster/i,
	/wpscan/i,
	/acunetix/i
];

function isBlockedPath(path: string): boolean {
	return BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function isBlockedUserAgent(userAgent: string): boolean {
	return BLOCKED_USER_AGENT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

export const requestFilterHandle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const userAgent = event.request.headers.get('user-agent') ?? '';
	const ip = event.getClientAddress();

	if (isBlockedPath(path)) {
		logger.debug(`Blocked scanner probe: ${path}`, 'Security', { ip });
		return new Response('Not Found', { status: 404 });
	}

	if (isBlockedUserAgent(userAgent)) {
		logger.debug(`Blocked suspicious user-agent: ${userAgent}`, 'Security', { ip });
		return new Response('Forbidden', { status: 403 });
	}

	return resolve(event);
};
