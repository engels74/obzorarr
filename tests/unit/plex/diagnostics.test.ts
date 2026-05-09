import { describe, expect, it } from 'bun:test';
import { describePlexUrl, formatPlexUrlDiagnostic } from '$lib/server/plex/diagnostics';

describe('Plex diagnostics', () => {
	it.each([
		['https://1-2-3-4.0123456789abcdef0123456789abcdef.plex.direct:32400', 'plex.direct'],
		['https://plex.example.com:443', 'public-domain'],
		['http://10.0.0.2:32400', 'private-ip'],
		['http://172.18.0.3:32400', 'docker/private-range'],
		['http://192.168.1.10:32400', 'private-ip'],
		['http://localhost:32400', 'localhost'],
		['https://8.8.8.8:32400', 'public-ip']
	] as const)('classifies %s as %s', (url, category) => {
		expect(describePlexUrl(url, 'db').category).toBe(category);
	});

	it('formats credentialed and query URLs without leaking raw values', () => {
		const url =
			'https://user:pass@plex.example.com:32400/library?X-Plex-Token=secret-token#section';
		const summary = formatPlexUrlDiagnostic(url, 'env');

		expect(summary).toContain('source=env');
		expect(summary).toContain('scheme=https');
		expect(summary).toContain('category=public-domain');
		expect(summary).toContain('port=32400');
		expect(summary).toContain('credentials=present');
		expect(summary).toContain('query=present');
		expect(summary).toContain('fragment=present');
		expect(summary).not.toContain('plex.example.com');
		expect(summary).not.toContain('user');
		expect(summary).not.toContain('pass');
		expect(summary).not.toContain('secret-token');
		expect(summary).not.toContain('/library');
	});
});
