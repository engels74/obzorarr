import { describe, expect, it } from 'bun:test';
import config from '../../../svelte.config.js';

describe('SvelteKit CSP configuration', () => {
	it('allows Plex and Gravatar avatar image sources', () => {
		const imgSrc = config.kit?.csp?.directives?.['img-src'];

		expect(imgSrc).toBeDefined();
		expect(Array.isArray(imgSrc)).toBe(true);
		expect(imgSrc).toContain('self');
		expect(imgSrc).toContain('https://plex.tv');
		expect(imgSrc).toContain('https://*.plex.direct');
		expect(imgSrc).toContain('https://secure.gravatar.com');
		expect(imgSrc).toContain('data:');
	});
});
