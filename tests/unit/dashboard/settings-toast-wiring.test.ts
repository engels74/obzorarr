import { beforeEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { setWrappedLogoMode, WrappedLogoMode } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { shareSettings, users } from '$lib/server/db/schema';
import { getOrCreateShareSettings, setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode } from '$lib/server/sharing/types';
import { actions } from '../../../src/routes/dashboard/settings/+page.server';
import { resetSharedTestDb } from '../../helpers/db';

// ISSUE-008 lock-in test.
//
// Two halves of the already-correct save-toast wiring:
//   (a) source-guard: +page.svelte imports handleFormToast and calls
//       handleFormToast(form) inside a $effect — the bridge that turns an action
//       result into a toast.
//   (b) action-payload: updateShareMode / updateLogoPreference each return the
//       legacy { success, message, action } shape that handleFormToast renders.
//
// Documented as expected (NOT a defect): the global $effect re-runs whenever the
// `form` REFERENCE changes, and handleFormToast does not dedupe. SvelteKit
// produces a fresh `form` object per action result, so each save toasts once;
// two identical saves produce two toasts — accepted behavior.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
const SETTINGS_PAGE = 'src/routes/dashboard/settings/+page.svelte';
const USER_ID = 314;
const YEAR = new Date().getFullYear();

async function readSource(relPath: string): Promise<string> {
	return Bun.file(join(PROJECT_ROOT, relPath)).text();
}

const userLocals = {
	user: { id: USER_ID, plexId: 100314, username: 'user-314', isAdmin: false }
} as unknown as App.Locals;

type UpdateShareModeAction = NonNullable<typeof actions.updateShareMode>;
type UpdateLogoAction = NonNullable<typeof actions.updateLogoPreference>;

function runUpdateShareMode(mode: string) {
	const formData = new FormData();
	formData.set('mode', mode);
	const request = new Request('http://localhost/dashboard/settings?/updateShareMode', {
		method: 'POST',
		body: formData
	});
	const handler = actions.updateShareMode as UpdateShareModeAction;
	return handler({ request, locals: userLocals } as Parameters<UpdateShareModeAction>[0]);
}

function runUpdateLogoPreference(preference: string) {
	const formData = new FormData();
	formData.set('logoPreference', preference);
	const request = new Request('http://localhost/dashboard/settings?/updateLogoPreference', {
		method: 'POST',
		body: formData
	});
	const handler = actions.updateLogoPreference as UpdateLogoAction;
	return handler({ request, locals: userLocals } as Parameters<UpdateLogoAction>[0]);
}

describe('ISSUE-008 source-guard — dashboard settings wires handleFormToast(form)', () => {
	it('imports handleFormToast', async () => {
		const src = await readSource(SETTINGS_PAGE);
		expect(src).toContain("import { handleFormToast } from '$lib/utils/form-toast'");
	});

	it('calls handleFormToast(form) inside a $effect (multi-statement block tolerated)', async () => {
		const src = await readSource(SETTINGS_PAGE);
		// Robust regex: handleFormToast(form) anywhere inside a $effect(() => { ... })
		// body. The real effect is multi-statement, so do NOT require a single-line
		// `$effect(() => handleFormToast(form))`.
		expect(src).toMatch(
			/\$effect\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?handleFormToast\s*\(\s*form\s*\)/
		);
	});
});

describe('ISSUE-008 action-payload — save actions return the legacy toast shape', () => {
	beforeEach(async () => {
		await resetSharedTestDb();
		await db.insert(users).values({
			id: USER_ID,
			plexId: 100314,
			accountId: 200314,
			username: 'user-314'
		});
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PUBLIC,
			allowUserControl: true
		});
		// Ensure the row exists, then grant per-user control so the action proceeds.
		await getOrCreateShareSettings({ userId: USER_ID, year: YEAR });
		await db
			.update(shareSettings)
			.set({ canUserControl: true })
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, YEAR)));
	});

	it('updateShareMode returns { success, message, action }', async () => {
		const result = (await runUpdateShareMode(ShareMode.PUBLIC)) as {
			success?: boolean;
			message?: string;
			action?: string;
		};
		expect(result.success).toBe(true);
		expect(typeof result.message).toBe('string');
		expect(result.message?.length ?? 0).toBeGreaterThan(0);
		expect(result.action).toBe('updateShareMode');
	});

	it('updateLogoPreference returns { success, message, action }', async () => {
		await setWrappedLogoMode(WrappedLogoMode.USER_CHOICE);

		const result = (await runUpdateLogoPreference('show')) as {
			success?: boolean;
			message?: string;
			action?: string;
		};
		expect(result.success).toBe(true);
		expect(typeof result.message).toBe('string');
		expect(result.message?.length ?? 0).toBeGreaterThan(0);
		expect(result.action).toBe('updateLogoPreference');
	});
});
