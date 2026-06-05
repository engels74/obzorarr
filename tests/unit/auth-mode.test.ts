import { describe, expect, it } from 'bun:test';
import { shouldUseRedirectAuth } from '$lib/client/auth-mode';

const REAL_CHROME_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEADLESS_CHROME_UA =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36';

interface TestNavigator {
	webdriver?: boolean;
	userAgent?: string;
}

function createNavigator(overrides: TestNavigator = {}): TestNavigator {
	return {
		webdriver: overrides.webdriver ?? false,
		userAgent: overrides.userAgent ?? REAL_CHROME_UA
	};
}

describe('shouldUseRedirectAuth', () => {
	it.each([
		['auth=redirect', createNavigator(), true],
		['auth=popup', createNavigator({ webdriver: true, userAgent: HEADLESS_CHROME_UA }), false],
		['', createNavigator({ webdriver: true }), true],
		['', createNavigator({ userAgent: HEADLESS_CHROME_UA }), true],
		['', createNavigator(), false],
		['', null, false]
	] as const)('returns %s for params=%p navigator=%p', (params, navigator, expected) => {
		expect(shouldUseRedirectAuth(new URLSearchParams(params), navigator)).toBe(expected);
	});

	it.each([
		'Playwright/1.44',
		'Puppeteer/22.0',
		'Selenium/4.0'
	] as const)('redirects for automation user agent %s', (tool) => {
		expect(
			shouldUseRedirectAuth(
				new URLSearchParams(),
				createNavigator({ userAgent: `Mozilla/5.0 ${tool}` })
			)
		).toBe(true);
	});
});
