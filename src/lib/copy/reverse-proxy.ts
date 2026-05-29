/**
 * Canonical copy for the reverse-proxy header-trust diagnostic surface.
 *
 * The same diagnostic UI appears in two places: the onboarding wizard at
 * /onboarding/proxy-trust and the admin tab at /admin/settings/security.
 * Both surfaces import labels from here so the panel title + manual-rerun
 * button stay in lockstep (ISSUE-001).
 */
export const REVERSE_PROXY_COPY = {
	panelTitle: 'Reverse-proxy header trust',
	panelSubtitle: 'Make sure Obzorarr correctly identifies your visitors',
	rerunButton: 'Re-run diagnostic',
	rerunButtonInProgress: 'Re-checking…'
} as const;
