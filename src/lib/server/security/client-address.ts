import { logger } from '$lib/server/logging';

/**
 * Placeholder used in logging context when the client address cannot be
 * determined. Not a real address — never feed this into rate-limit keys.
 */
export const UNKNOWN_CLIENT_ADDRESS = 'unknown';

export interface SafeClientAddressResult {
	/** The resolved client address, or `null` when indeterminate. */
	address: string | null;
	/** True only when `event.getClientAddress()` threw. */
	indeterminate: boolean;
}

// Process-level dedup so a persistent misconfiguration (e.g. an adapter that
// never resolves a peer address) is surfaced once at WARN level instead of
// spamming the log channel on every request.
let warnedOnce = false;

/**
 * Resolve `event.getClientAddress()` defensively. SvelteKit throws
 * `Could not determine clientAddress` when the underlying socket address is
 * indeterminate (e.g. an aborted/closed SSE connection re-entering the
 * pipeline, or adapter-bun returning no peer address). Letting that throw
 * escape to `handleError` yields a non-JSON/empty body that clients then fail
 * to parse, so callers use this helper to branch instead.
 *
 * The catch only fires when the real call throws; a present address is never
 * overridden.
 */
export function safeClientAddress(event: {
	getClientAddress: () => string;
}): SafeClientAddressResult {
	try {
		return { address: event.getClientAddress(), indeterminate: false };
	} catch {
		return { address: null, indeterminate: true };
	}
}

/**
 * Emit a single deduped WARN when the client address could not be determined,
 * so a production proxy/adapter misconfiguration stays visible without
 * flooding logs. At most one WARN per process until {@link resetClientAddressWarning}.
 */
export function warnIndeterminateClientAddress(source: string, path: string): void {
	if (warnedOnce) {
		return;
	}
	warnedOnce = true;
	logger.warn(
		'Could not determine client address; check reverse-proxy / adapter configuration',
		source,
		{ path }
	);
}

/** Test hook: reset the deduped-warning latch so each test starts clean. */
export function resetClientAddressWarning(): void {
	warnedOnce = false;
}
