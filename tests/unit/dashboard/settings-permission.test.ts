import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { appSettings, shareSettings, users } from '$lib/server/db/schema';
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource } from '$lib/server/sharing/types';
import { actions, load } from '../../../src/routes/dashboard/settings/+page.server';

type LoadArgs = Parameters<typeof load>[0];
type UpdateShareModeAction = NonNullable<typeof actions.updateShareMode>;

const USER_ID = 42;
const YEAR = new Date().getFullYear();
const locals = {
	user: { id: USER_ID, plexId: 100042, username: 'user-42', isAdmin: false }
} as App.Locals;

async function seedUser(): Promise<void> {
	await db.insert(users).values({
		id: USER_ID,
		plexId: 100042,
		accountId: 200042,
		username: 'user-42'
	});
}

async function invokeUpdateShareMode(mode: string) {
	const formData = new FormData();
	formData.set('mode', mode);
	const request = new Request('https://obzorarr.example/dashboard/settings', {
		method: 'POST',
		body: formData
	});
	const updateShareMode = actions.updateShareMode as UpdateShareModeAction;
	return updateShareMode({ request, locals } as unknown as Parameters<UpdateShareModeAction>[0]);
}

describe('dashboard settings per-user share control', () => {
	beforeEach(async () => {
		await db.delete(shareSettings);
		await db.delete(appSettings);
		await db.delete(users);
		await seedUser();
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: false
		});
		await db.insert(shareSettings).values({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PUBLIC,
			modeSource: ShareModeSource.EXPLICIT,
			shareToken: null,
			canUserControl: true
		});
	});

	it('honors an admin-granted user control row even when the global default is false', async () => {
		const data = (await load({ locals } as unknown as LoadArgs)) as {
			shareSettings: { canUserControl: boolean };
		};
		expect(data.shareSettings.canUserControl).toBe(true);

		const result = await invokeUpdateShareMode(ShareMode.PRIVATE_LINK);
		expect((result as { status?: number }).status).toBeUndefined();

		const row = await db
			.select({ mode: shareSettings.mode })
			.from(shareSettings)
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, YEAR)))
			.limit(1);
		expect(row[0]?.mode).toBe(ShareMode.PRIVATE_LINK);
	});
});
