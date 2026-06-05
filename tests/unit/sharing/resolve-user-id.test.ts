import { beforeEach, describe, expect, it } from 'bun:test';
import { isHttpError } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { shareSettings } from '$lib/server/db/schema';
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode } from '$lib/server/sharing/types';
import { actions, load } from '../../../src/routes/wrapped/[year=year]/u/[identifier]/+page.server';
import { resetSharedTestDb } from '../../helpers/db';
import { createFormRequest } from '../../helpers/requests';
import { seedSharingUser } from '../../helpers/sharing';

type LoadArgs = Parameters<typeof load>[0];
type UpdateShareModeAction = NonNullable<typeof actions.updateShareMode>;
type RegenerateTokenAction = NonNullable<typeof actions.regenerateToken>;

const YEAR = 2024;
const EXISTING_USER_ID = 42;
const UNKNOWN_USER_ID = 9999999;

async function invokeUpdateShareMode(identifier: string) {
	const request = createFormRequest('https://obzorarr.example/wrapped', {
		mode: ShareMode.PUBLIC
	});
	const updateShareMode = actions.updateShareMode as UpdateShareModeAction;
	return updateShareMode({
		request,
		params: { year: String(YEAR), identifier },
		locals: {
			user: {
				id: EXISTING_USER_ID,
				plexId: 100042,
				username: 'alice',
				isAdmin: true
			}
		}
	} as unknown as Parameters<UpdateShareModeAction>[0]);
}

async function invokeRegenerateToken(identifier: string) {
	const regenerateToken = actions.regenerateToken as RegenerateTokenAction;
	return regenerateToken({
		params: { year: String(YEAR), identifier },
		locals: {
			user: {
				id: EXISTING_USER_ID,
				plexId: 100042,
				username: 'alice',
				isAdmin: true
			}
		}
	} as unknown as Parameters<RegenerateTokenAction>[0]);
}

async function invokeLoad(identifier: string) {
	return load({
		params: { year: String(YEAR), identifier },
		locals: {},
		parent: async () => ({ availableYears: [YEAR] }),
		setHeaders: () => {}
	} as unknown as LoadArgs);
}

describe('resolveUserIdFromIdentifier (unknown numeric ids)', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: true
		});
		await seedSharingUser({
			id: EXISTING_USER_ID,
			plexId: 100_042,
			accountId: 200_042,
			username: 'alice'
		});
	});

	it('updateShareMode returns fail(400) for an unknown numeric identifier', async () => {
		const result = await invokeUpdateShareMode(String(UNKNOWN_USER_ID));

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Invalid user identifier' }
		});

		const rows = await db.select().from(shareSettings);
		expect(rows.length).toBe(0);
	});

	it('regenerateToken returns fail(400) for an unknown numeric identifier', async () => {
		const result = await invokeRegenerateToken(String(UNKNOWN_USER_ID));

		expect(result).toMatchObject({
			status: 400,
			data: { error: 'Invalid user identifier' }
		});

		const rows = await db.select().from(shareSettings);
		expect(rows.length).toBe(0);
	});

	it('load throws 404 for an unknown numeric identifier and creates no share_settings row', async () => {
		let caught: unknown;
		try {
			await invokeLoad(String(UNKNOWN_USER_ID));
		} catch (err) {
			caught = err;
		}

		expect(isHttpError(caught)).toBe(true);
		if (!isHttpError(caught)) throw caught;
		expect(caught.status).toBe(404);

		const rows = await db.select().from(shareSettings);
		expect(rows.filter((r) => r.userId === UNKNOWN_USER_ID).length).toBe(0);
	});

	it('updateShareMode succeeds for an existing user (sanity check)', async () => {
		const adminUser = {
			id: EXISTING_USER_ID,
			plexId: 100042,
			username: 'alice',
			isAdmin: true
		};
		const request = createFormRequest('https://obzorarr.example/wrapped', {
			mode: ShareMode.PUBLIC
		});
		const updateShareMode = actions.updateShareMode as UpdateShareModeAction;
		const result = await updateShareMode({
			request,
			params: { year: String(YEAR), identifier: String(EXISTING_USER_ID) },
			locals: { user: adminUser }
		} as unknown as Parameters<UpdateShareModeAction>[0]);

		expect((result as { success?: boolean }).success).toBe(true);
	});
});
