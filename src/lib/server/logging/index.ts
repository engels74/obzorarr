export { logger } from './logger';
export {
	getRetentionSchedulerStatus,
	isRetentionSchedulerConfigured,
	setupLogRetentionScheduler,
	stopLogRetentionScheduler,
	triggerRetentionCleanup
} from './retention';
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
