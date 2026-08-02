import { runPlexAccountReconciliation } from '$lib/server/plex/account-reconciliation';

export type {
	PlexAccountInfo,
	UserLookupResult
} from '$lib/server/plex/account-reconciliation';
export {
	findUserByUsername,
	getAllPlexAccounts,
	getPlexUsername,
	hasFreshPlexAccountMapping
} from '$lib/server/plex/account-reconciliation';

export async function syncPlexAccounts(): Promise<number> {
	return runPlexAccountReconciliation();
}
