import { beforeEach, describe, expect, it } from 'bun:test';
import { FunFactFrequency, getFunFactFrequency } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, customSlides, slideConfig } from '$lib/server/db/schema';
import {
	getSlideConfigByType,
	initializeDefaultSlideConfig
} from '$lib/server/slides/config.service';
import { actions } from '../../../src/routes/admin/slides/+page.server';

type SetFunFactFrequencyAction = NonNullable<typeof actions.setFunFactFrequency>;
type CreateCustomAction = NonNullable<typeof actions.createCustom>;
type UpdateCustomAction = NonNullable<typeof actions.updateCustom>;
type DeleteCustomAction = NonNullable<typeof actions.deleteCustom>;
type ToggleCustomSlideAction = NonNullable<typeof actions.toggleCustomSlide>;
type ReorderAction = NonNullable<typeof actions.reorder>;

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

function buildCreateCustomRequest(fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		formData.set(k, v);
	}
	return new Request('http://localhost/admin/slides?/createCustom', {
		method: 'POST',
		body: formData
	});
}

function buildUpdateCustomRequest(fields: Record<string, string>): Request {
	const formData = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		formData.set(k, v);
	}
	return new Request('http://localhost/admin/slides?/updateCustom', {
		method: 'POST',
		body: formData
	});
}

function buildIdRequest(action: string, id: string): Request {
	const formData = new FormData();
	formData.set('id', id);
	return new Request(`http://localhost/admin/slides?/${action}`, {
		method: 'POST',
		body: formData
	});
}

function buildReorderRequest(
	order: Array<{ type: 'builtin' | 'custom'; id: string | number }>
): Request {
	const formData = new FormData();
	formData.set('order', JSON.stringify(order));
	return new Request('http://localhost/admin/slides?/reorder', {
		method: 'POST',
		body: formData
	});
}

async function runCreateCustom(request: Request) {
	const handler = actions.createCustom as CreateCustomAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<CreateCustomAction>[0]);
}

async function runUpdateCustom(request: Request) {
	const handler = actions.updateCustom as UpdateCustomAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<UpdateCustomAction>[0]);
}

async function runDeleteCustom(request: Request) {
	const handler = actions.deleteCustom as DeleteCustomAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<DeleteCustomAction>[0]);
}

async function runToggleCustomSlide(request: Request) {
	const handler = actions.toggleCustomSlide as ToggleCustomSlideAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<ToggleCustomSlideAction>[0]);
}

async function runReorder(request: Request) {
	const handler = actions.reorder as ReorderAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<ReorderAction>[0]);
}

describe('admin slides actions', () => {
	beforeEach(async () => {
		await db.delete(appSettings);
		await db.delete(customSlides);
		await db.delete(slideConfig);
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

	describe('createCustom error mapping', () => {
		it('returns 400 with fieldErrors.content when content has unsafe HTML', async () => {
			const result = await runCreateCustom(
				buildCreateCustomRequest({
					title: 'Hello',
					content: '<script>alert(1)</script>',
					enabled: 'true'
				})
			);

			expect(result).toMatchObject({
				status: 400,
				data: {
					error: 'Content contains potentially unsafe HTML patterns',
					fieldErrors: { content: ['Content contains potentially unsafe HTML patterns'] }
				}
			});
		});

		it('returns 400 with fieldErrors.title when title exceeds Zod max', async () => {
			const result = await runCreateCustom(
				buildCreateCustomRequest({
					title: 'x'.repeat(201),
					content: 'Some content',
					enabled: 'true'
				})
			);
			expect(result).toMatchObject({
				status: 400,
				data: {
					error: 'Validation failed',
					fieldErrors: { title: expect.any(Array) }
				}
			});
		});
	});

	describe('updateCustom error mapping', () => {
		it('returns 404 when id does not exist', async () => {
			const result = await runUpdateCustom(
				buildUpdateCustomRequest({
					id: '99999',
					title: 'Updated',
					content: 'Updated content'
				})
			);
			expect(result).toMatchObject({
				status: 404,
				data: { error: expect.stringContaining('not found') }
			});
		});

		it('returns 400 with fieldErrors.content when updating with unsafe HTML', async () => {
			const insertResult = await db
				.insert(customSlides)
				.values({
					title: 'Existing',
					content: 'Hello world',
					enabled: true,
					sortOrder: 0,
					year: null
				})
				.returning();
			const id = insertResult[0]?.id;
			expect(id).toBeDefined();

			const result = await runUpdateCustom(
				buildUpdateCustomRequest({
					id: String(id),
					content: '<script>boom()</script>'
				})
			);
			expect(result).toMatchObject({
				status: 400,
				data: {
					fieldErrors: { content: expect.any(Array) }
				}
			});
		});
	});

	describe('toggleCustomSlide / deleteCustom error mapping', () => {
		it('toggleCustomSlide returns 404 for unknown id', async () => {
			const result = await runToggleCustomSlide(buildIdRequest('toggleCustomSlide', '99999'));
			expect(result).toMatchObject({
				status: 404,
				data: { error: expect.stringContaining('not found') }
			});
		});

		it('deleteCustom returns 404 for unknown id', async () => {
			const result = await runDeleteCustom(buildIdRequest('deleteCustom', '99999'));
			expect(result).toMatchObject({
				status: 404,
				data: { error: expect.stringContaining('not found') }
			});
		});
	});

	describe('reorder', () => {
		it('persists unified built-in and custom slide order', async () => {
			await initializeDefaultSlideConfig();
			const insertResult = await db
				.insert(customSlides)
				.values({
					title: 'Custom recap',
					content: 'Custom content',
					enabled: true,
					sortOrder: 99,
					year: null
				})
				.returning();
			const customId = insertResult[0]?.id;
			expect(customId).toBeDefined();

			const result = await runReorder(
				buildReorderRequest([
					{ type: 'custom', id: customId ?? 0 },
					{ type: 'builtin', id: 'genres' },
					{ type: 'builtin', id: 'total-time' }
				])
			);

			expect(result).toMatchObject({ success: true });

			const customRows = await db.select().from(customSlides);
			const customRow = customRows.find((row) => row.id === customId);
			expect(customRow?.sortOrder).toBe(0);
			expect((await getSlideConfigByType('genres'))?.sortOrder).toBe(1);
			expect((await getSlideConfigByType('total-time'))?.sortOrder).toBe(2);
		});
	});
});
