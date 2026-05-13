import { describe, expect, it } from 'bun:test';
import { CRON_REQUIRED_MESSAGE } from '$lib/cron/validation';
import { actions } from '../../../src/routes/admin/sync/+page.server';

type InitSchedulerAction = NonNullable<typeof actions.initScheduler>;

const adminLocals = {
	user: { id: 1, plexId: 1, username: 'admin', isAdmin: true }
} as unknown as App.Locals;

function createInitSchedulerRequest(cronExpression: string): Request {
	const formData = new FormData();
	formData.set('cronExpression', cronExpression);

	return new Request('http://localhost/admin/sync?/initScheduler', {
		method: 'POST',
		body: formData
	});
}

async function runInitScheduler(request: Request) {
	const handler = actions.initScheduler as InitSchedulerAction;
	return handler({
		request,
		locals: adminLocals
	} as Parameters<InitSchedulerAction>[0]);
}

describe('admin sync actions', () => {
	describe('initScheduler', () => {
		it('rejects an explicitly empty cron expression', async () => {
			const result = await runInitScheduler(createInitSchedulerRequest(''));

			expect(result).toMatchObject({
				status: 400,
				data: {
					error: CRON_REQUIRED_MESSAGE,
					cronError: CRON_REQUIRED_MESSAGE,
					cronExpression: ''
				}
			});
		});
	});
});
