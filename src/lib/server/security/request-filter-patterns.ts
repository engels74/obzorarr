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
	/^\/actuator/i,
	/^\/debug\//i,
	/^\/console/i,
	/^\/manager/i,
	/^\/phpinfo/i,
	/^\/cgi-bin/i
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

export function isBlockedPath(path: string): boolean {
	return BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

export function isBlockedUserAgent(userAgent: string): boolean {
	return BLOCKED_USER_AGENT_PATTERNS.some((pattern) => pattern.test(userAgent));
}
