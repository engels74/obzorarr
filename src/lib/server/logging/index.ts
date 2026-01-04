// Types

// Logger instance
export { logger } from './logger';
// Retention scheduler
export {
	getRetentionSchedulerStatus,
	isRetentionSchedulerConfigured,
	setupLogRetentionScheduler,
	stopLogRetentionScheduler,
	triggerRetentionCleanup
} from './retention';
// Service functions
export {
	deleteAllLogs,
	deleteLogsOlderThan,
	getDistinctSources,
	getLatestLogId,
	getLogCountsByLevel,
	getLogMaxCount,
	getLogRetentionDays,
	getLogsAfterId,
	insertLog,
	insertLogsBatch,
	isDebugEnabled,
	queryLogs,
	runRetentionCleanup,
	setDebugEnabled,
	setLogMaxCount,
	setLogRetentionDays,
	trimLogsToCount
} from './service';
export {
	type LogEntry,
	LogEntrySchema,
	LogLevel,
	LogLevelSchema,
	LogLevelSeverity,
	type LogLevelType,
	type LogQueryOptions,
	LogQueryOptionsSchema,
	type LogQueryResult,
	LogSettingsDefaults,
	LogSettingsKey,
	type NewLogEntry
} from './types';
