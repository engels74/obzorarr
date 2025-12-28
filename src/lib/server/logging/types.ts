import { z } from 'zod';

export const LogLevel = {
	DEBUG: 'DEBUG',
	INFO: 'INFO',
	WARN: 'WARN',
	ERROR: 'ERROR'
} as const;

export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

export const LogLevelSeverity: Record<LogLevelType, number> = {
	DEBUG: 0,
	INFO: 1,
	WARN: 2,
	ERROR: 3
};

export interface LogEntry {
	id: number;
	level: LogLevelType;
	message: string;
	source: string | null;
	metadata: string | null;
	timestamp: number;
}

export interface NewLogEntry {
	level: LogLevelType;
	message: string;
	source?: string;
	metadata?: Record<string, unknown>;
}

export interface LogQueryOptions {
	levels?: LogLevelType[];
	search?: string;
	source?: string;
	fromTimestamp?: number;
	toTimestamp?: number;
	cursor?: number;
	limit?: number;
}

export interface LogQueryResult {
	logs: LogEntry[];
	hasMore: boolean;
	totalCount: number;
}

export const LogLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']);

export const LogEntrySchema = z.object({
	id: z.number(),
	level: LogLevelSchema,
	message: z.string(),
	source: z.string().nullable(),
	metadata: z.string().nullable(),
	timestamp: z.number()
});

export const LogQueryOptionsSchema = z.object({
	levels: z.array(LogLevelSchema).optional(),
	search: z.string().optional(),
	source: z.string().optional(),
	fromTimestamp: z.number().optional(),
	toTimestamp: z.number().optional(),
	cursor: z.number().optional(),
	limit: z.number().min(1).max(1000).optional()
});

export const LogSettingsKey = {
	RETENTION_DAYS: 'log_retention_days',
	MAX_COUNT: 'log_max_count',
	DEBUG_ENABLED: 'log_debug_enabled'
} as const;

export const LogSettingsDefaults = {
	RETENTION_DAYS: 7,
	MAX_COUNT: 50000,
	DEBUG_ENABLED: false
} as const;
