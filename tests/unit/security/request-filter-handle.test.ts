import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { logger } from '$lib/server/logging';
import { resetClientAddressWarning } from '$lib/server/security/client-address';
import { requestFilterHandle } from '$lib/server/security/request-filter';

function makeThrowingEvent(url: string) {
	return {
		request: new Request(url),
		url: new URL(url),
		getClientAddress: () => {
			throw new Error('Could not determine clientAddress');
		}
	} as unknown as Parameters<typeof requestFilterHandle>[0]['event'];
}

describe('requestFilterHandle with indeterminate client address', () => {
	afterEach(() => {
		resetClientAddressWarning();
	});

	it('does not propagate the getClientAddress throw and resolves normally', async () => {
		resetClientAddressWarning();
		const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {});
		try {
			const sentinel = new Response('resolved', { status: 200 });
			const resolve = mock(async () => sentinel);

			const result = await requestFilterHandle({
				event: makeThrowingEvent('https://example.com/dashboard'),
				resolve
			} as unknown as Parameters<typeof requestFilterHandle>[0]);

			expect(resolve).toHaveBeenCalledTimes(1);
			expect((result as Response).status).toBe(200);
			expect(warnSpy).toHaveBeenCalledTimes(1);
		} finally {
			warnSpy.mockRestore();
		}
	});
});
