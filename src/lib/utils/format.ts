export function formatDuration(ms: number): string {
	if (ms < 1000) return '<1s';
	if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
	if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
	return `${Math.floor(ms / 3600000)}h`;
}

/**
 * Privacy-preserving rendering for the /admin/users table. Email addresses are
 * sensitive personal data even when only admins can see them; mask to keep
 * screenshots and screen-recordings from leaking full addresses.
 */
export function maskEmail(email: string): string {
	if (!email) return '';
	const at = email.lastIndexOf('@');
	if (at < 1) return '***';
	const local = email.slice(0, at);
	const domain = email.slice(at + 1);
	const maskedLocal = `${local[0]}${local.length > 1 ? '***' : ''}`;
	const dot = domain.indexOf('.');
	if (dot < 1) return `${maskedLocal}@***`;
	const tld = domain.slice(dot); // includes the leading dot, multi-dot TLDs preserved
	return `${maskedLocal}@${domain[0]}***${tld}`;
}
