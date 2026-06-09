import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { logger } from '$lib/server/logging';
import {
	resetClientAddressWarning,
	safeClientAddress,
	UNKNOWN_CLIENT_ADDRESS,
	warnIndeterminateClientAddress
} from '$lib/server/security/client-address';

describe('safeClientAddress', () => {
	it('passes through a present address unchanged', () => {
		const result = safeClientAddress({ getClientAddress: () => '1.2.3.4' });
		expect(result).toEqual({ address: '1.2.3.4', indeterminate: false });
	});

	it('returns indeterminate when getClientAddress throws', () => {
		const result = safeClientAddress({
			getClientAddress: () => {
				throw new Error('Could not determine clientAddress');
			}
		});
		expect(result).toEqual({ address: null, indeterminate: true });
	});
});

describe('warnIndeterminateClientAddress', () => {
	afterEach(() => {
		resetClientAddressWarning();
	});

	it('logs at WARN level only once across many calls until reset', () => {
		const warnSpy = spyOn(logger, 'warn').mockImplementation(() => {});
		try {
			resetClientAddressWarning();

			for (let i = 0; i < 5; i++) {
				warnIndeterminateClientAddress('Security', '/api/sse');
			}

			expect(warnSpy).toHaveBeenCalledTimes(1);
			expect(warnSpy.mock.calls[0]?.[1]).toBe('Security');

			resetClientAddressWarning();
			warnIndeterminateClientAddress('Security', '/api/sse');
			expect(warnSpy).toHaveBeenCalledTimes(2);
		} finally {
			warnSpy.mockRestore();
		}
	});
});

describe('UNKNOWN_CLIENT_ADDRESS', () => {
	it('is a non-empty placeholder string', () => {
		expect(typeof UNKNOWN_CLIENT_ADDRESS).toBe('string');
		expect(UNKNOWN_CLIENT_ADDRESS.length).toBeGreaterThan(0);
	});
});
