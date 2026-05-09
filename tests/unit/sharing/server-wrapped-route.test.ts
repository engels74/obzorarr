import { beforeEach, describe, expect, it } from 'bun:test';
import { isHttpError } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { setServerWrappedShareMode } from '$lib/server/sharing/service';
import { ShareMode } from '$lib/server/sharing/types';
import { load } from '../../../src/routes/wrapped/[year]/+page.server';

type ServerWrappedLoad = typeof load;

describe('server wrapped route access', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	it('denies anonymous route loads when server wrapped mode is private-oauth', async () => {
		await setServerWrappedShareMode(ShareMode.PRIVATE_OAUTH);

		try {
			await load({
				params: { year: '2024' },
				locals: {},
				url: new URL('http://localhost/wrapped/2024')
			} as Parameters<ServerWrappedLoad>[0]);
			expect.unreachable('Expected server wrapped load to throw');
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
			if (!isHttpError(error)) throw error;
			expect(error.status).toBe(403);
			expect(error.body.message).toContain('Sign in');
		}
	});
});
