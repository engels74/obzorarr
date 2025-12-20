import { z } from 'zod';

/**
 * Logging Types
 *
 * Defines log levels, interfaces, and Zod schemas for the logging system.
 */

// =============================================================================
// Log Level Enum
// =============================================================================

/**
 * Log levels in order of severity
 */
export const LogLevel = {
	DEBUG: 'DEBUG',
	INFO: 'INFO',
	WARN: 'WARN',
	ERROR: 'ERROR'
} as const;

export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Log level severity order (lower = less severe)
 */
export const LogLevelSeverity: Record<LogLevelType, number> = {
	DEBUG: 0,
	INFO: 1,
	WARN: 2,
	ERROR: 3
};

// =============================================================================
// Log Entry Interfaces
// =============================================================================

/**
 * A log entry as stored in the database
 */
export interface LogEntry {
	id: number;
	level: LogLevelType;
	message: string;
	source: string | null;
	metadata: string | null;
	timestamp: number; // Unix timestamp in ms
}

/**
 * A new log entry to be inserted
 */
export interface NewLogEntry {
	level: LogLevelType;
	message: string;
	source?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Options for querying logs
 */
export interface LogQueryOptions {
	levels?: LogLevelType[];
	search?: string;
	source?: string;
	fromTimestamp?: number;
	toTimestamp?: number;
	cursor?: number; // Log ID for cursor-based pagination
	limit?: number;
}

/**
 * Result of a log query
 */
export interface LogQueryResult {
	logs: LogEntry[];
	hasMore: boolean;
	totalCount: number;
}

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Schema for validating log level
 */
export const LogLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']);

/**
 * Schema for validating a log entry
 */
export const LogEntrySchema = z.object({
	id: z.number(),
	level: LogLevelSchema,
	message: z.string(),
	source: z.string().nullable(),
	metadata: z.string().nullable(),
	timestamp: z.number()
});

/**
 * Schema for validating log query options
 */
export const LogQueryOptionsSchema = z.object({
	levels: z.array(LogLevelSchema).optional(),
	search: z.string().optional(),
	source: z.string().optional(),
	fromTimestamp: z.number().optional(),
	toTimestamp: z.number().optional(),
	cursor: z.number().optional(),
	limit: z.number().min(1).max(1000).optional()
});

// =============================================================================
// Settings Keys
// =============================================================================

/**
 * Logging-related app settings keys
 */
export const LogSettingsKey = {
	RETENTION_DAYS: 'log_retention_days',
	MAX_COUNT: 'log_max_count',
	DEBUG_ENABLED: 'log_debug_enabled'
} as const;

/**
 * Default logging settings
 */
export const LogSettingsDefaults = {
	RETENTION_DAYS: 7,
	MAX_COUNT: 50000,
	DEBUG_ENABLED: false
} as const;
