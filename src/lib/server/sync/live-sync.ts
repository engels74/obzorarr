/**
 * Live Sync Service
 *
 * Provides automatic sync triggers for wrapped pages with proper
 * concurrency control, throttling, and configuration management.
 *
 * Features:
 * - Atomic in-memory locking to prevent race conditions
 * - Time-based throttling (3-minute cooldown between syncs)
 * - Configuration via environment variable or database setting
 * - Non-blocking sync triggers (fire-and-forget pattern)
 *
 * @module sync/live-sync
 */

import { env } from '$env/dynamic/private';
import { startBackgroundSync } from './scheduler';
import { isSyncRunning } from './service';
import { getSyncProgress, type LiveSyncProgress } from './progress';
import { getAppSetting, AppSettingsKey } from '$lib/server/admin/settings.service';
import { logger } from '$lib/server/logging';

// =============================================================================
// Constants
// =============================================================================

/**
 * Minimum time between live sync triggers (3 minutes)
 */
const LIVE_SYNC_COOLDOWN_MS = 3 * 60 * 1000;

/**
 * Safety timeout for releasing stuck locks (30 minutes)
 */
const LOCK_SAFETY_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Interval for checking sync completion (1 second)
 */
const SYNC_CHECK_INTERVAL_MS = 1000;

/**
 * Delay before clearing progress after sync completes (5 seconds)
 */
const PROGRESS_CLEAR_DELAY_MS = 5000;

// =============================================================================
// Types
// =============================================================================

/**
 * Result of attempting to trigger a live sync
 */
export interface LiveSyncResult {
	/** Whether a new sync was triggered */
	triggered: boolean;
	/** Whether a sync is currently in progress */
	syncInProgress: boolean;
	/** Reason why sync was not triggered (if applicable) */
	reason?: 'disabled' | 'cooldown' | 'already_running' | 'lock_held' | 'error';
	/** Milliseconds until next sync is allowed (if in cooldown) */
	cooldownRemaining?: number;
}

/**
 * Sync status for frontend display
 */
export interface SyncStatus {
	/** Whether a sync is currently in progress */
	inProgress: boolean;
	/** Current sync progress (if available) */
	progress: LiveSyncProgress | null;
}

// =============================================================================
// Lock State (In-Memory Mutex)
// =============================================================================

/**
 * In-memory lock for preventing concurrent sync triggers
 *
 * Why in-memory vs database:
 * - Single-server architecture (Bun + SQLite)
 * - Lower latency (no DB roundtrip)
 * - Automatically clears on server restart
 * - JavaScript's single-threaded nature ensures atomicity
 */
let syncLock: {
	acquired: boolean;
	acquiredAt: Date | null;
	acquiredBy: string | null;
} = {
	acquired: false,
	acquiredAt: null,
	acquiredBy: null
};

/**
 * Attempt to acquire the sync lock atomically
 *
 * @param source - Identifier for the lock holder (for debugging)
 * @returns true if lock was acquired, false if already held
 */
export function tryAcquireSyncLock(source: string): boolean {
	// Atomic check-and-set (JavaScript single-threaded guarantee)
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

/**
 * Release the sync lock
 */
export function releaseSyncLock(): void {
	syncLock = {
		acquired: false,
		acquiredAt: null,
		acquiredBy: null
	};
}

/**
 * Check if the sync lock is currently held
 */
export function isSyncLockHeld(): boolean {
	return syncLock.acquired;
}

/**
 * Get lock info for debugging
 */
export function getSyncLockInfo(): {
	acquired: boolean;
	acquiredAt: Date | null;
	acquiredBy: string | null;
} {
	return { ...syncLock };
}

// =============================================================================
// Throttle State
// =============================================================================

/**
 * Track when the last live sync completed
 */
let lastLiveSyncCompletedAt: Date | null = null;

/**
 * Check if enough time has passed since the last sync
 *
 * @returns true if a new sync can be triggered
 */
export function canTriggerLiveSync(): boolean {
	if (!lastLiveSyncCompletedAt) {
		return true;
	}

	const elapsed = Date.now() - lastLiveSyncCompletedAt.getTime();
	return elapsed >= LIVE_SYNC_COOLDOWN_MS;
}

/**
 * Record that a live sync completed successfully
 */
export function recordLiveSyncCompletion(): void {
	lastLiveSyncCompletedAt = new Date();
}

/**
 * Get milliseconds until the next sync is allowed
 *
 * @returns 0 if sync is allowed now, otherwise remaining cooldown time
 */
export function getTimeUntilNextSync(): number {
	if (!lastLiveSyncCompletedAt) {
		return 0;
	}

	const elapsed = Date.now() - lastLiveSyncCompletedAt.getTime();
	return Math.max(0, LIVE_SYNC_COOLDOWN_MS - elapsed);
}

/**
 * Get the cooldown duration in milliseconds
 */
export function getLiveSyncCooldownMs(): number {
	return LIVE_SYNC_COOLDOWN_MS;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Check if live sync is enabled
 *
 * Priority: Environment variable > Database setting > Default (true)
 *
 * @returns true if live sync is enabled
 */
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

// =============================================================================
// Main Trigger Function
// =============================================================================

/**
 * Attempt to trigger a live sync if all conditions are met
 *
 * This is the main entry point for automatic sync triggers.
 * It checks all conditions before starting a background sync:
 * 1. Live sync must be enabled
 * 2. Cooldown period must have elapsed
 * 3. No sync currently running
 * 4. Must acquire sync lock
 *
 * @param source - Identifier for the trigger source (e.g., 'landing-page', 'server-wrapped')
 * @returns Result indicating whether sync was triggered
 */
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

/**
 * Schedule cleanup tasks after sync completes
 *
 * Monitors sync progress and releases lock when done.
 * Also records completion time for throttling.
 */
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

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get current sync status for frontend display
 *
 * @returns Sync status object with progress information
 */
export async function getSyncStatus(): Promise<SyncStatus> {
	return {
		inProgress: await isSyncRunning(),
		progress: getSyncProgress()
	};
}
