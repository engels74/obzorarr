import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getApiConfigWithSources, hasPlexEnvConfig } from '$lib/server/admin/settings.service';
import { messageForMembershipFailure, verifyServerMembership } from '$lib/server/auth/membership';
import { getSessionPlexToken } from '$lib/server/auth/session';
import type { MembershipResult } from '$lib/server/auth/types';
import { db } from '$lib/server/db/client';
import { sessions, users } from '$lib/server/db/schema';
import { logger } from '$lib/server/logging';
import { isOnboardingComplete, OnboardingSteps, setOnboardingStep } from '$lib/server/onboarding';
import {
	fetchServerIdentity,
	refreshConfiguredServerMachineId
} from '$lib/server/plex/server-identity.service';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const parentData = await parent();

	const canProceed = parentData.hasEnvConfig && parentData.isAuthenticated && parentData.isAdmin;

	let configuredMachineId: string | null = null;
	let configuredUrlReachable = true;
	let configuredUrlErrorReason: string | null = null;

	if (parentData.hasEnvConfig) {
		// Force a live /identity probe on load so the reachability banner reflects
		// the current server state, not a possibly-stale cached machineId that
		// could hide the "Cannot reach configured Plex server" remediation path.
		const identity = await refreshConfiguredServerMachineId();
		configuredMachineId = identity.machineId;
		configuredUrlReachable = identity.machineId !== null;
		configuredUrlErrorReason = identity.errorReason;
	}

	return {
		...parentData,
		canProceed,
		isNonAdminUser: parentData.isAuthenticated && !parentData.isAdmin,
		configuredMachineId,
		configuredUrlReachable,
		configuredUrlErrorReason
	};
};

export const actions: Actions = {
	verifyAdmin: async ({ locals, cookies }) => {
		if (!locals.user) {
			return fail(401, { error: 'Please sign in with Plex first' });
		}

		const sessionId = cookies.get('session');
		if (!sessionId) {
			return fail(401, { error: 'Session not found' });
		}

		try {
			const plexToken = await getSessionPlexToken(sessionId);
			if (!plexToken) {
				return fail(401, { error: 'Session expired. Please sign in again.' });
			}

			const membership = await verifyServerMembership(plexToken);

			if (!membership.isMember) {
				const failurePayload: {
					error: string;
					membershipReason?: 'not_reachable' | 'not_in_resources';
					configuredMachineId?: string;
				} = {
					error: messageForMembershipFailure(membership),
					membershipReason:
						membership.reason === 'not_reachable' ? 'not_reachable' : 'not_in_resources'
				};
				if (membership.configuredMachineId) {
					failurePayload.configuredMachineId = membership.configuredMachineId;
				}
				return fail(403, failurePayload);
			}

			if (!membership.isOwner) {
				return fail(403, {
					error:
						'Only the server owner can configure Obzorarr. Please sign in with the server owner account.'
				});
			}

			logger.info(`Onboarding: Admin verified - ${locals.user.username}`, 'Onboarding');

			await setOnboardingStep(OnboardingSteps.SYNC);
			redirect(303, '/onboarding/sync');
		} catch (err) {
			if (
				err instanceof Response ||
				(err &&
					typeof err === 'object' &&
					'status' in err &&
					(err as { status: number }).status >= 300 &&
					(err as { status: number }).status < 400)
			) {
				throw err;
			}

			logger.error(
				`Admin verification failed: ${err instanceof Error ? err.message : String(err)}`,
				'Onboarding'
			);

			return fail(500, {
				error: 'Failed to verify admin status. Please try again.'
			});
		}
	},

	continueAfterServerSelection: async ({ locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Please sign in with Plex first' });
		}

		if (!locals.user.isAdmin) {
			return fail(403, {
				error: 'Only the server owner can configure Obzorarr.'
			});
		}

		logger.info(`Onboarding: Server selection complete - ${locals.user.username}`, 'Onboarding');

		await setOnboardingStep(OnboardingSteps.SYNC);
		redirect(303, '/onboarding/sync');
	},

	forceManualSelection: async ({ locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Please sign in with Plex first' });
		}

		if (!locals.user.isAdmin) {
			return fail(403, { error: 'Only the server owner can configure Obzorarr.' });
		}

		// When PLEX_SERVER_URL / PLEX_TOKEN are set as environment variables they
		// take unconditional precedence over any database value in getPlexConfig().
		// Letting the user proceed through the manual picker would silently write
		// DB values that the rest of the application ignores, creating a confusing
		// "I configured a different server but nothing changed" experience.
		// The correct remediation is to update or remove the env vars.
		if (hasPlexEnvConfig()) {
			return fail(400, {
				error:
					'PLEX_SERVER_URL / PLEX_TOKEN are set as environment variables and cannot be overridden from the UI. To use a different server, update those environment variables and restart Obzorarr.'
			});
		}

		// The "Use a different server" button is only rendered when hasEnvConfig is
		// true (see +page.svelte), which means the guard above has already returned.
		// If the action is ever reached with env absent, the manual picker is already
		// visible on the same page, so there is no meaningful redirect target — surface
		// the dead-end explicitly rather than no-op.
		return fail(400, {
			error:
				'Manual server selection is already available on this page. Reload if the picker is not visible.'
		});
	},

	confirmOwnershipOverride: async ({ locals, cookies }) => {
		if (!locals.user) {
			return fail(401, { error: 'Please sign in with Plex first' });
		}

		if (await isOnboardingComplete()) {
			return fail(403, {
				error: 'Onboarding is already complete. Admin status cannot be changed from this page.'
			});
		}

		const sessionId = cookies.get('session');
		if (!sessionId) {
			return fail(401, { error: 'Session not found' });
		}

		const plexToken = await getSessionPlexToken(sessionId);
		if (!plexToken) {
			return fail(401, { error: 'Session expired. Please sign in again.' });
		}

		let membership: MembershipResult;
		try {
			membership = await verifyServerMembership(plexToken);
		} catch (err) {
			if (
				err instanceof Response ||
				(err &&
					typeof err === 'object' &&
					'status' in err &&
					(err as { status: number }).status >= 300 &&
					(err as { status: number }).status < 400)
			) {
				throw err;
			}
			logger.error(
				`Ownership override verification failed: ${err instanceof Error ? err.message : String(err)}`,
				'Onboarding'
			);
			return fail(500, { error: 'Failed to verify server ownership. Please try again.' });
		}

		const apiConfig = await getApiConfigWithSources();
		const configuredUrl = apiConfig.plex.serverUrl.value;

		// The override exists for the narrow case where the configured server is
		// not in the user's Plex.tv /resources list (e.g. hostname-routed self-hosts
		// Plex.tv can't return), so verifyServerMembership cannot set isOwner here.
		// When that specific failure mode occurs, require direct token-level access
		// instead: the user's plex token must be able to fetch /identity from the
		// configured URL and return the same machineIdentifier the configured token
		// already observed. That proves they can talk to the server with their own
		// credentials, which is the strongest available proof when /resources is silent.
		if (!membership.isOwner) {
			if (membership.reason !== 'not_in_resources' || !membership.configuredMachineId) {
				return fail(403, {
					error: membership.isMember
						? 'Only the server owner can use the admin override. Please sign in with the server owner account.'
						: messageForMembershipFailure(membership)
				});
			}

			const directProbe = await fetchServerIdentity(configuredUrl, plexToken);
			const matches =
				directProbe.identity?.machineIdentifier.toLowerCase() ===
				membership.configuredMachineId.toLowerCase();
			if (!matches) {
				logger.warn(
					`Onboarding: Admin override denied for ${configuredUrl} user=${locals.user.username} reason=${directProbe.errorReason ?? 'machine_id_mismatch'}`,
					'Onboarding'
				);
				return fail(403, {
					error:
						'Could not verify ownership with your Plex token. The token must be able to reach the configured server directly.'
				});
			}
		}

		const userId = locals.user.id;
		await db.transaction(async (tx) => {
			await tx.update(sessions).set({ isAdmin: true }).where(eq(sessions.id, sessionId));
			await tx.update(users).set({ isAdmin: true, accountId: 1 }).where(eq(users.id, userId));
		});

		logger.warn(
			`Onboarding: Admin override used for ${configuredUrl} machineId=${membership.configuredMachineId ?? 'unknown'} user=${locals.user.username}`,
			'Onboarding'
		);

		await setOnboardingStep(OnboardingSteps.SYNC);
		redirect(303, '/onboarding/sync');
	}
};
