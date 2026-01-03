import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dismissCsrfWarning } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	if (!locals.user.isAdmin) {
		error(403, 'Admin access required');
	}

	try {
		await dismissCsrfWarning();
		logger.info(
			`CSRF warning dismissed by ${locals.user.username} (ID: ${locals.user.id})`,
			'Security'
		);
		return json({ success: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to dismiss warning';
		logger.error(`Failed to dismiss CSRF warning: ${message}`, 'Security');
		error(500, message);
	}
};
