/**
 * Detects whether the Plex login flow should use the same-tab redirect path
 * instead of the default popup. Lets headless browsers / E2E automation
 * complete OAuth without orchestrating a second window.
 *
 * Precedence: explicit `?auth=` query param overrides any heuristic.
 */
export function shouldUseRedirectAuth(searchParams: URLSearchParams): boolean {
	const authParam = searchParams.get('auth');
	if (authParam === 'redirect') return true;
	if (authParam === 'popup') return false;

	if (typeof navigator === 'undefined') return false;
	if (navigator.webdriver === true) return true;

	const ua = navigator.userAgent || '';
	return /HeadlessChrome|Playwright|Puppeteer|Selenium/i.test(ua);
}
