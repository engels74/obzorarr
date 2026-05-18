import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * US-022: monolith deleted. Settings tabs live at their own nested routes
 * under /admin/settings/<tab>. This file now only redirects.
 *
 * Action handlers used to live here too — they were preserved for one
 * iteration as legacy-URL targets but every test importer (settings-actions,
 * csrf-action, server-wrapped-route) has since been re-pointed to the
 * matching nested-route +page.server.ts. With no in-tree caller and no
 * test caller, the handlers were deleted along with the rest of the
 * monolith body. External clients still POSTing to /admin/settings?/<name>
 * will now 405 / 404 — the nested-route URLs (e.g.
 * /admin/settings/system?/updateLogSettings) are the supported targets.
 */
const KNOWN_TABS = new Set(['connections', 'security', 'data', 'system', 'appearance', 'privacy']);

export const load: PageServerLoad = async ({ url }) => {
	const tab = url.searchParams.get('tab');
	if (tab && KNOWN_TABS.has(tab)) {
		redirect(303, `/admin/settings/${tab}`);
	}
	redirect(303, '/admin/settings/connections');
};
