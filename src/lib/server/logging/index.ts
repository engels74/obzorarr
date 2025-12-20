/**
 * Logging Module
 *
 * Provides a production-ready logging system with:
 * - Persistent log storage in SQLite
 * - Batched writes for performance
 * - Log levels (DEBUG, INFO, WARN, ERROR)
 * - Configurable retention policy
 * - SSE streaming support
 *
 * Usage:
 * ```typescript
 * import { logger } from '$lib/server/logging';
 *
 * logger.info('Starting sync', 'Scheduler');
 * logger.error('Sync failed', 'Sync', { error: error.message });
 * ```
 */

// Types
export {
	LogLevel,
	LogLevelSeverity,
	LogSettingsKey,
	LogSettingsDefaults,
	LogLevelSchema,
	LogEntrySchema,
	LogQueryOptionsSchema,
	type LogLevelType,
	type LogEntry,
	type NewLogEntry,
	type LogQueryOptions,
	type LogQueryResult
} from './types';

// Service functions
export {
	insertLog,
	insertLogsBatch,
	queryLogs,
	getLogsAfterId,
	getLatestLogId,
	getDistinctSources,
	getLogCountsByLevel,
	deleteAllLogs,
	deleteLogsOlderThan,
	trimLogsToCount,
	runRetentionCleanup,
	getLogRetentionDays,
	getLogMaxCount,
	isDebugEnabled,
	setLogRetentionDays,
	setLogMaxCount,
	setDebugEnabled
} from './service';

// Logger instance
export { logger } from './logger';

// Retention scheduler
export {
	setupLogRetentionScheduler,
	stopLogRetentionScheduler,
	triggerRetentionCleanup,
	getRetentionSchedulerStatus,
	isRetentionSchedulerConfigured
} from './retention';
