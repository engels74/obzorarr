import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { shouldUseRedirectAuth } from '$lib/client/auth-mode';

const REAL_CHROME_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEADLESS_CHROME_UA =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36';

interface NavigatorOverrides {
	webdriver?: boolean;
	userAgent?: string;
}

const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setNavigator(overrides: NavigatorOverrides | null): void {
	if (overrides === null) {
		Object.defineProperty(globalThis, 'navigator', {
			value: undefined,
			configurable: true,
			writable: true
		});
		return;
	}
	Object.defineProperty(globalThis, 'navigator', {
		value: { webdriver: overrides.webdriver ?? false, userAgent: overrides.userAgent ?? '' },
		configurable: true,
		writable: true
	});
}

describe('shouldUseRedirectAuth', () => {
	beforeEach(() => {
		setNavigator({ webdriver: false, userAgent: REAL_CHROME_UA });
	});

	afterEach(() => {
		if (originalDescriptor) {
			Object.defineProperty(globalThis, 'navigator', originalDescriptor);
		} else {
			delete (globalThis as { navigator?: unknown }).navigator;
		}
	});

	it('returns true when ?auth=redirect is present', () => {
		const params = new URLSearchParams('auth=redirect');
		expect(shouldUseRedirectAuth(params)).toBe(true);
	});

	it('returns false when ?auth=popup is present even on headless browsers', () => {
		setNavigator({ webdriver: true, userAgent: HEADLESS_CHROME_UA });
		const params = new URLSearchParams('auth=popup');
		expect(shouldUseRedirectAuth(params)).toBe(false);
	});

	it('returns true when navigator.webdriver is true', () => {
		setNavigator({ webdriver: true, userAgent: REAL_CHROME_UA });
		expect(shouldUseRedirectAuth(new URLSearchParams())).toBe(true);
	});

	it('returns true when user agent contains HeadlessChrome', () => {
		setNavigator({ webdriver: false, userAgent: HEADLESS_CHROME_UA });
		expect(shouldUseRedirectAuth(new URLSearchParams())).toBe(true);
	});

	it('returns true when user agent contains Playwright/Puppeteer/Selenium', () => {
		for (const tool of ['Playwright/1.44', 'Puppeteer/22.0', 'Selenium/4.0']) {
			setNavigator({ webdriver: false, userAgent: `Mozilla/5.0 ${tool}` });
			expect(shouldUseRedirectAuth(new URLSearchParams())).toBe(true);
		}
	});

	it('returns false for default Chrome UA without webdriver flag', () => {
		expect(shouldUseRedirectAuth(new URLSearchParams())).toBe(false);
	});

	it('returns false when navigator is undefined (SSR)', () => {
		setNavigator(null);
		expect(shouldUseRedirectAuth(new URLSearchParams())).toBe(false);
	});
});
