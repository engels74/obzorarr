import { describe, expect, it } from 'bun:test';
import { isBlockedPath, isBlockedUserAgent } from '$lib/server/security/request-filter-patterns';

describe('request filter patterns', () => {
	it('blocks scanner paths without exposing filesystem details', () => {
		expect(isBlockedPath('/.env')).toBe(true);
		expect(isBlockedPath('/.git/config')).toBe(true);
		expect(isBlockedPath('/wp-admin')).toBe(true);
		expect(isBlockedPath('/admin')).toBe(false);
	});

	it('blocks known scanner user agents', () => {
		expect(isBlockedUserAgent('Mozilla/5.0 nuclei')).toBe(true);
		expect(isBlockedUserAgent('sqlmap/1.8')).toBe(true);
		expect(isBlockedUserAgent('Mozilla/5.0 Safari/605.1.15')).toBe(false);
	});
});
