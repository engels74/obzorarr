import { z } from 'zod';

export const SyncStatusValue = {
	RUNNING: 'running',
	COMPLETED: 'completed',
	FAILED: 'failed',
	CANCELLED: 'cancelled'
} as const;

export type SyncStatusValue = (typeof SyncStatusValue)[keyof typeof SyncStatusValue];

export interface StartSyncOptions {
	backfillYear?: number;
	signal?: AbortSignal;
	onProgress?: (progress: SyncProgress) => void;
}

export type SyncPhase = 'fetching' | 'enriching';

export interface SyncProgress {
	recordsProcessed: number;
	recordsInserted: number;
	recordsSkipped: number;
	currentPage: number;
	isComplete: boolean;
	phase?: SyncPhase;
	enrichmentTotal?: number;
	enrichmentProcessed?: number;
}

export interface SyncResult {
	syncId: number;
	status: SyncStatusValue;
	recordsProcessed: number;
	recordsInserted: number;
	recordsSkipped: number;
	lastViewedAt: number | null;
	startedAt: Date;
	completedAt: Date;
	error?: string;
	durationMs: number;
}

export interface SyncStatusRecord {
	id: number;
	startedAt: Date;
	completedAt: Date | null;
	recordsProcessed: number;
	lastViewedAt: number | null;
	status: SyncStatusValue;
	error: string | null;
}

export interface SchedulerOptions {
	/**
	 * IANA zone the cron expression is interpreted in. Required so a scheduler
	 * can never be constructed without stating its zone: an optional field with a
	 * UTC default is exactly how every call site silently ran in UTC while the
	 * deployment was configured for another zone.
	 */
	timezone: string;
	cronExpression?: string;
	protect?: boolean;
	startImmediately?: boolean;
}

export interface SchedulerStatus {
	isRunning: boolean;
	isPaused: boolean;
	nextRun: Date | null;
	previousRun: Date | null;
	cronExpression: string | null;
}

export const CronExpressionSchema = z
	.string()
	.regex(
		/^(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)\s+(\*|[0-9,\-/]+)(\s+(\*|[0-9,\-/]+))?$/,
		'Invalid cron expression'
	);
