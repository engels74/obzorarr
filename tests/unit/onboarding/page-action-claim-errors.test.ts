import { describe, expect, it } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import { ONBOARDING_CLAIM_REQUIRED_MESSAGE } from '$lib/server/onboarding/bootstrap';
import { actions as plexActions } from '../../../src/routes/onboarding/plex/+page.server';
import { actions as settingsActions } from '../../../src/routes/onboarding/settings/+page.server';
import { actions as syncActions } from '../../../src/routes/onboarding/sync/+page.server';

type Action = (event: unknown) => Promise<unknown>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

const claimCheckedActions = [
	['plex.verifyAdmin', plexActions.verifyAdmin],
	['plex.continueAfterServerSelection', plexActions.continueAfterServerSelection],
	['plex.forceManualSelection', plexActions.forceManualSelection],
	['plex.confirmOwnershipOverride', plexActions.confirmOwnershipOverride],
	['settings.saveSettings', settingsActions.saveSettings],
	['settings.skipSettings', settingsActions.skipSettings],
	['settings.testAIConnection', settingsActions.testAIConnection],
	['sync.startSync', syncActions.startSync],
	['sync.cancelSync', syncActions.cancelSync],
	['sync.continue', syncActions.continue]
] as const;

function makeCookies(errorToThrow?: Error): Cookies {
	return {
		get: () => {
			if (errorToThrow) throw errorToThrow;
			return undefined;
		},
		getAll: () => [],
		set: () => {},
		delete: () => {},
		serialize: () => ''
	} as unknown as Cookies;
}

async function runAction(action: unknown, cookies: Cookies): Promise<unknown> {
	const request = new Request('http://localhost/onboarding', {
		method: 'POST',
		body: new FormData()
	});

	return (action as Action)({
		request,
		locals: adminLocals,
		cookies,
		url: new URL(request.url)
	});
}

describe('onboarding page action claim checks', () => {
	for (const [name, action] of claimCheckedActions) {
		it(`${name} returns the expected claim-required failure`, async () => {
			const result = await runAction(action, makeCookies());

			expect(result).toMatchObject({
				status: 403,
				data: { error: ONBOARDING_CLAIM_REQUIRED_MESSAGE }
			});
		});

		it(`${name} propagates unexpected claim errors`, async () => {
			const unexpected = new Error(`unexpected claim renewal failure in ${name}`);

			try {
				await runAction(action, makeCookies(unexpected));
				expect.unreachable('Expected unexpected claim error to be thrown');
			} catch (err) {
				expect(err).toBe(unexpected);
			}
		});
	}
});
