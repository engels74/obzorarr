import { beforeEach, describe, expect, it } from 'bun:test';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { shareSettings, users } from '$lib/server/db/schema';
import { getShareSettingsByToken, setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource } from '$lib/server/sharing/types';
import { actions, load } from '../../../src/routes/dashboard/settings/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

type LoadArgs = Parameters<typeof load>[0];
type UpdateShareModeAction = NonNullable<typeof actions.updateShareMode>;
type RegenerateTokenAction = NonNullable<typeof actions.regenerateToken>;

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

async function invokeRegenerateToken() {
	const regenerateToken = actions.regenerateToken as RegenerateTokenAction;
	return regenerateToken({ locals } as unknown as Parameters<RegenerateTokenAction>[0]);
}

describe('dashboard settings per-user share control', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
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

	it('denies a share-mode change when global allow-user-control is OFF despite a stored true row (ISSUE-003)', async () => {
		// beforeEach seeds global allowUserControl=false with a stale per-row
		// canUserControl=true — the exact dogfood bypass. Effective control must be
		// false: load reports it disabled and the action returns 403 server-side.
		const data = (await load({ locals, setHeaders: () => {} } as unknown as LoadArgs)) as {
			shareSettings: { canUserControl: boolean };
		};
		expect(data.shareSettings.canUserControl).toBe(false);

		const result = await invokeUpdateShareMode(ShareMode.PRIVATE_LINK);
		expect((result as { status?: number }).status).toBe(403);

		const row = await db
			.select({ mode: shareSettings.mode })
			.from(shareSettings)
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, YEAR)))
			.limit(1);
		// Mode is unchanged — the bypass is blocked.
		expect(row[0]?.mode).toBe(ShareMode.PUBLIC);
	});

	it('allows a share-mode change when global allow-user-control is ON', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: true
		});

		const result = await invokeUpdateShareMode(ShareMode.PRIVATE_LINK);
		expect((result as { status?: number }).status).toBeUndefined();

		const row = await db
			.select({ mode: shareSettings.mode })
			.from(shareSettings)
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, YEAR)))
			.limit(1);
		expect(row[0]?.mode).toBe(ShareMode.PRIVATE_LINK);
	});

	it('returns the refreshed private href and invalidates the previous token on regenerate', async () => {
		// Regenerate is a user-control action, so the global flag must be ON.
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: true
		});
		const oldToken = '11111111-1111-4111-8111-111111111111';
		await db
			.update(shareSettings)
			.set({
				mode: ShareMode.PRIVATE_LINK,
				modeSource: ShareModeSource.EXPLICIT,
				shareToken: oldToken,
				canUserControl: true
			})
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, YEAR)));

		const result = (await invokeRegenerateToken()) as {
			success?: boolean;
			action?: string;
			shareToken?: string;
			wrappedHref?: string;
			status?: number;
		};

		expect(result.status).toBeUndefined();
		expect(result.success).toBe(true);
		expect(result.action).toBe('regenerateToken');
		expect(typeof result.shareToken).toBe('string');
		expect(result.shareToken).not.toBe(oldToken);
		expect(result.wrappedHref).toBe(`/wrapped/${YEAR}/u/${result.shareToken}`);
		expect(await getShareSettingsByToken(oldToken)).toBeNull();
		expect(await getShareSettingsByToken(result.shareToken!)).not.toBeNull();
	});
});
