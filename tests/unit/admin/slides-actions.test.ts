import { beforeEach, describe, expect, it } from 'bun:test';
import { FunFactFrequency, getFunFactFrequency } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings } from '$lib/server/db/schema';
import { actions } from '../../../src/routes/admin/slides/+page.server';

type SetFunFactFrequencyAction = NonNullable<typeof actions.setFunFactFrequency>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function createFrequencyRequest(mode: string, customCount?: string): Request {
	const formData = new FormData();
	formData.set('mode', mode);
	if (customCount !== undefined) {
		formData.set('customCount', customCount);
	}

	return new Request('http://localhost/admin/slides?/setFunFactFrequency', {
		method: 'POST',
		body: formData
	});
}

async function runSetFunFactFrequency(request: Request) {
	const setFrequency = actions.setFunFactFrequency as SetFunFactFrequencyAction;
	return setFrequency({
		request,
		locals: adminLocals
	} as Parameters<SetFunFactFrequencyAction>[0]);
}

describe('admin slides actions', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
	});

	for (const customCount of ['0', '16', '', '1abc', '1.5']) {
		it(`rejects invalid custom fun fact count ${customCount || '<empty>'}`, async () => {
			const result = await runSetFunFactFrequency(
				createFrequencyRequest(FunFactFrequency.CUSTOM, customCount)
			);

			expect(result).toMatchObject({
				status: 400,
				data: {
					error: 'Custom count must be between 1 and 15'
				}
			});
		});
	}

	for (const [customCount, expectedCount] of [
		['1', 1],
		['15', 15]
	] as const) {
		it(`accepts custom fun fact count ${customCount}`, async () => {
			await expect(
				runSetFunFactFrequency(createFrequencyRequest(FunFactFrequency.CUSTOM, customCount))
			).resolves.toMatchObject({
				success: true,
				funFactFrequency: {
					mode: FunFactFrequency.CUSTOM,
					count: expectedCount
				}
			});

			expect(await getFunFactFrequency()).toEqual({
				mode: FunFactFrequency.CUSTOM,
				count: expectedCount
			});
		});
	}
});
