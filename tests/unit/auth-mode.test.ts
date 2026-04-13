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
	it('returns true when ?auth=redirect is present', () => {
		const params = new URLSearchParams('auth=redirect');
		expect(shouldUseRedirectAuth(params, createNavigator())).toBe(true);
	});

	it('returns false when ?auth=popup is present even on headless browsers', () => {
		const params = new URLSearchParams('auth=popup');
		expect(
			shouldUseRedirectAuth(
				params,
				createNavigator({ webdriver: true, userAgent: HEADLESS_CHROME_UA })
			)
		).toBe(false);
	});

	it('returns true when navigator.webdriver is true', () => {
		expect(shouldUseRedirectAuth(new URLSearchParams(), createNavigator({ webdriver: true }))).toBe(
			true
		);
	});

	it('returns true when user agent contains HeadlessChrome', () => {
		expect(
			shouldUseRedirectAuth(
				new URLSearchParams(),
				createNavigator({ userAgent: HEADLESS_CHROME_UA })
			)
		).toBe(true);
	});

	it('returns true when user agent contains Playwright/Puppeteer/Selenium', () => {
		for (const tool of ['Playwright/1.44', 'Puppeteer/22.0', 'Selenium/4.0']) {
			expect(
				shouldUseRedirectAuth(
					new URLSearchParams(),
					createNavigator({ userAgent: `Mozilla/5.0 ${tool}` })
				)
			).toBe(true);
		}
	});

	it('returns false for default Chrome UA without webdriver flag', () => {
		expect(shouldUseRedirectAuth(new URLSearchParams(), createNavigator())).toBe(false);
	});

	it('returns false when navigator is undefined (SSR)', () => {
		expect(shouldUseRedirectAuth(new URLSearchParams(), null)).toBe(false);
	});
});
