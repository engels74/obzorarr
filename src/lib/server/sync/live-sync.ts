import { env } from '$env/dynamic/private';
import { startBackgroundSync } from './scheduler';
import { isSyncRunning } from './service';
import { getSyncProgress, type LiveSyncProgress } from './progress';
import { getAppSetting, AppSettingsKey } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';

const LIVE_SYNC_COOLDOWN_MS = 3 * 60 * 1000;
const LOCK_SAFETY_TIMEOUT_MS = 30 * 60 * 1000;
const SYNC_CHECK_INTERVAL_MS = 1000;
const PROGRESS_CLEAR_DELAY_MS = 5000;

export interface LiveSyncResult {
	triggered: boolean;
	syncInProgress: boolean;
	reason?: 'disabled' | 'cooldown' | 'already_running' | 'lock_held' | 'error';
	cooldownRemaining?: number;
}

export interface SyncStatus {
	inProgress: boolean;
	progress: LiveSyncProgress | null;
}

// In-memory lock - JS single-threaded nature ensures atomicity
let syncLock: {
	acquired: boolean;
	acquiredAt: Date | null;
	acquiredBy: string | null;
} = {
	acquired: false,
	acquiredAt: null,
	acquiredBy: null
};

export function tryAcquireSyncLock(source: string): boolean {
	if (syncLock.acquired) {
		return false;
	}

	syncLock = {
		acquired: true,
		acquiredAt: new Date(),
		acquiredBy: source
	};

	return true;
}

export function releaseSyncLock(): void {
	syncLock = {
		acquired: false,
		acquiredAt: null,
		acquiredBy: null
	};
}

export function isSyncLockHeld(): boolean {
	return syncLock.acquired;
}

export function getSyncLockInfo(): {
	acquired: boolean;
	acquiredAt: Date | null;
	acquiredBy: string | null;
} {
	return { ...syncLock };
}

let lastLiveSyncCompletedAt: Date | null = null;

export function canTriggerLiveSync(): boolean {
	if (!lastLiveSyncCompletedAt) {
		return true;
	}

	const elapsed = Date.now() - lastLiveSyncCompletedAt.getTime();
	return elapsed >= LIVE_SYNC_COOLDOWN_MS;
}

export function recordLiveSyncCompletion(): void {
	lastLiveSyncCompletedAt = new Date();
}

export function getTimeUntilNextSync(): number {
	if (!lastLiveSyncCompletedAt) {
		return 0;
	}

	const elapsed = Date.now() - lastLiveSyncCompletedAt.getTime();
	return Math.max(0, LIVE_SYNC_COOLDOWN_MS - elapsed);
}

export function getLiveSyncCooldownMs(): number {
	return LIVE_SYNC_COOLDOWN_MS;
}

// Priority: Environment variable > Database setting > Default (true)
export async function isLiveSyncEnabled(): Promise<boolean> {
	// Environment variable takes precedence
	const envValue = env.ENABLE_LIVE_SYNC;
	if (envValue !== undefined && envValue !== '') {
		return envValue.toLowerCase() === 'true';
	}

	// Check database setting
	const dbValue = await getAppSetting(AppSettingsKey.ENABLE_LIVE_SYNC);
	if (dbValue !== null) {
		return dbValue.toLowerCase() === 'true';
	}

	// Default to enabled
	return true;
}

export async function triggerLiveSyncIfNeeded(source: string): Promise<LiveSyncResult> {
	// 1. Check if live sync is enabled
	const enabled = await isLiveSyncEnabled();
	if (!enabled) {
		logger.debug('Live sync disabled, skipping', 'LiveSync');
		return { triggered: false, syncInProgress: false, reason: 'disabled' };
	}

	// 2. Check cooldown
	if (!canTriggerLiveSync()) {
		const remaining = getTimeUntilNextSync();
		logger.debug(
			`Live sync cooldown active (${Math.round(remaining / 1000)}s remaining)`,
			'LiveSync'
		);
		return {
			triggered: false,
			syncInProgress: await isSyncRunning(),
			reason: 'cooldown',
			cooldownRemaining: remaining
		};
	}

	// 3. Check if sync is already running (quick check before acquiring lock)
	if (await isSyncRunning()) {
		logger.debug('Sync already running, skipping live sync trigger', 'LiveSync');
		return { triggered: false, syncInProgress: true, reason: 'already_running' };
	}

	// 4. Try to acquire lock (atomic)
	if (!tryAcquireSyncLock(source)) {
		logger.debug(`Failed to acquire sync lock (held by: ${syncLock.acquiredBy})`, 'LiveSync');
		return { triggered: false, syncInProgress: true, reason: 'lock_held' };
	}

	try {
		// Double-check sync isn't running after acquiring lock (TOCTOU protection)
		if (await isSyncRunning()) {
			releaseSyncLock();
			return { triggered: false, syncInProgress: true, reason: 'already_running' };
		}

		// 5. Start background sync
		logger.info(`Live sync triggered from: ${source}`, 'LiveSync');
		const result = await startBackgroundSync();

		if (result.started) {
			// Schedule post-sync cleanup (lock release and cooldown update)
			schedulePostSyncCleanup();

			return { triggered: true, syncInProgress: true };
		} else {
			releaseSyncLock();
			logger.debug(`Background sync failed to start: ${result.error}`, 'LiveSync');
			return { triggered: false, syncInProgress: false, reason: 'error' };
		}
	} catch (error) {
		releaseSyncLock();
		const message = error instanceof Error ? error.message : 'Unknown error';
		logger.error(`Live sync trigger failed: ${message}`, 'LiveSync');
		return { triggered: false, syncInProgress: false, reason: 'error' };
	}
}

function schedulePostSyncCleanup(): void {
	const checkInterval = setInterval(() => {
		const progress = getSyncProgress();

		// Check if sync is no longer running
		if (!progress || progress.status !== 'running') {
			clearInterval(checkInterval);
			releaseSyncLock();

			// Record completion time if sync succeeded
			if (progress?.status === 'completed') {
				recordLiveSyncCompletion();
				logger.debug('Live sync completed, cooldown started', 'LiveSync');
			} else if (progress?.status === 'failed') {
				// Don't record completion for failed syncs (allow retry sooner)
				logger.debug('Live sync failed, no cooldown applied', 'LiveSync');
			}
		}
	}, SYNC_CHECK_INTERVAL_MS);

	// Safety timeout: release lock after 30 minutes max
	setTimeout(() => {
		clearInterval(checkInterval);
		if (isSyncLockHeld()) {
			releaseSyncLock();
			logger.warn('Live sync lock released due to safety timeout', 'LiveSync');
		}
	}, LOCK_SAFETY_TIMEOUT_MS);
}

export async function getSyncStatus(): Promise<SyncStatus> {
	return {
		inProgress: await isSyncRunning(),
		progress: getSyncProgress()
	};
}
