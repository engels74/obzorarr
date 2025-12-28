import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	setAppSetting,
	AppSettingsKey,
	setCachedServerName
} from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';

const SelectServerSchema = z.object({
	serverUrl: z.string().url('Invalid server URL'),
	accessToken: z.string().min(1, 'Access token is required'),
	serverName: z.string().min(1, 'Server name is required')
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Authentication required');
	}

	if (!locals.user.isAdmin) {
		error(403, 'Only server owners can configure Obzorarr');
	}

	try {
		const body = await request.json();
		const parseResult = SelectServerSchema.safeParse(body);

		if (!parseResult.success) {
			const errorMessage = parseResult.error.issues[0]?.message ?? 'Invalid request';
			error(400, errorMessage);
		}

		const { serverUrl, accessToken, serverName } = parseResult.data;

		await setAppSetting(AppSettingsKey.PLEX_SERVER_URL, serverUrl);
		await setAppSetting(AppSettingsKey.PLEX_TOKEN, accessToken);
		await setCachedServerName(serverName);

		logger.info(`Onboarding: Server configured - ${serverName} (${serverUrl})`, 'Onboarding');

		return json({
			success: true,
			serverName
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		logger.error(
			`Failed to save server config: ${err instanceof Error ? err.message : String(err)}`,
			'Onboarding'
		);
		error(500, 'Failed to save server configuration');
	}
};
