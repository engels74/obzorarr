interface AuthNavigator {
	webdriver?: boolean;
	userAgent?: string;
}

/**
 * Detects whether the Plex login flow should use the same-tab redirect path
 * instead of the default popup. Lets headless browsers / E2E automation
 * complete OAuth without orchestrating a second window.
 *
 * Precedence: explicit `?auth=` query param overrides any heuristic.
 */
export function shouldUseRedirectAuth(
	searchParams: URLSearchParams,
	currentNavigator: AuthNavigator | null = typeof navigator === 'undefined' ? null : navigator
): boolean {
	const authParam = searchParams.get('auth');
	if (authParam === 'redirect') return true;
	if (authParam === 'popup') return false;

	if (!currentNavigator) return false;
	if (currentNavigator.webdriver === true) return true;

	const ua = currentNavigator.userAgent || '';
	return /HeadlessChrome|Playwright|Puppeteer|Selenium/i.test(ua);
}
