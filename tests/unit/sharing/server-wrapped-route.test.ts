import { beforeEach, describe, expect, it } from 'bun:test';
import { isHttpError } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { setServerWrappedShareMode } from '$lib/server/sharing/service';
import { ShareMode } from '$lib/server/sharing/types';
import { actions as adminSettingsActions } from '../../../src/routes/admin/settings/+page.server';
import { load } from '../../../src/routes/wrapped/[year]/+page.server';

type ServerWrappedLoad = typeof load;
type UpdateServerWrappedSettingsAction = NonNullable<
	typeof adminSettingsActions.updateServerWrappedSettings
>;

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
				url: new URL('http://localhost/wrapped/2024'),
				setHeaders: () => {}
			} as unknown as Parameters<ServerWrappedLoad>[0]);
			expect.unreachable('Expected server wrapped load to throw');
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
			if (!isHttpError(error)) throw error;
			expect(error.status).toBe(403);
			expect(error.body.message).toContain('Sign in');
		}
	});

	it('sets no-store cache control on server wrapped loads', async () => {
		await setServerWrappedShareMode(ShareMode.PRIVATE_OAUTH);
		const headers: Record<string, string> = {};

		try {
			await load({
				params: { year: '2024' },
				locals: {},
				url: new URL('http://localhost/wrapped/2024'),
				setHeaders: (values: Record<string, string>) => Object.assign(headers, values)
			} as unknown as Parameters<ServerWrappedLoad>[0]);
			expect.unreachable('Expected server wrapped load to throw');
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
		}

		expect(headers['cache-control']).toBe('no-store');
	});

	it('denies anonymous loads after admin saves server wrapped as private-oauth', async () => {
		const formData = new FormData();
		formData.set('anonymizationMode', 'real');
		formData.set('serverWrappedShareMode', ShareMode.PRIVATE_OAUTH);
		formData.set('settingsVersion', new Date(0).toISOString());
		const request = new Request('https://obzorarr.example/admin/settings', {
			method: 'POST',
			body: formData
		});
		const updateServerWrappedSettings =
			adminSettingsActions.updateServerWrappedSettings as UpdateServerWrappedSettingsAction;

		const result = await updateServerWrappedSettings({
			request,
			locals: {
				user: { id: 1, plexId: 100001, username: 'admin', isAdmin: true }
			}
		} as Parameters<UpdateServerWrappedSettingsAction>[0]);
		expect(result).toMatchObject({ success: true });

		try {
			await load({
				params: { year: '2024' },
				locals: {},
				url: new URL('http://localhost/wrapped/2024'),
				setHeaders: () => {}
			} as unknown as Parameters<ServerWrappedLoad>[0]);
			expect.unreachable('Expected server wrapped load to throw after settings update');
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
			if (!isHttpError(error)) throw error;
			expect(error.status).toBe(403);
		}
	});
});
