/**
 * Unit tests for Log Retention Scheduler
 *
 * Tests the Croner-based scheduling for automatic log cleanup.
 */

import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';

// Track mock instances for assertions
let mockCronInstances: MockCron[] = [];
let mockRunRetentionCleanup: ReturnType<typeof mock>;

// Mock Cron class
class MockCron {
	public name: string;
	public expression: string;
	public timezone: string;
	public callback: () => Promise<void>;
	public catchHandler: ((error: unknown, job: MockCron) => void) | undefined;
	private _isRunning = true;
	private _stopped = false;
	private _nextRun: Date | null = new Date(Date.now() + 86400000); // Tomorrow
	private _previousRun: Date | null = null;

	constructor(
		expression: string,
		options: Record<string, unknown>,
		callback?: () => Promise<void>
	) {
		this.expression = expression;
		this.name = (options.name as string) ?? 'unnamed';
		this.timezone = (options.timezone as string) ?? 'UTC';
		this.catchHandler = options.catch as ((error: unknown, job: MockCron) => void) | undefined;
		this.callback = callback ?? (async () => {});
		mockCronInstances.push(this);
	}

	stop(): void {
		this._stopped = true;
		this._isRunning = false;
	}

	isRunning(): boolean {
		return this._isRunning && !this._stopped;
	}

	nextRun(): Date | null {
		return this._nextRun;
	}

	previousRun(): Date | null {
		return this._previousRun;
	}

	// Test helpers
	_setIsRunning(value: boolean): void {
		this._isRunning = value;
	}

	_setPreviousRun(date: Date | null): void {
		this._previousRun = date;
	}

	_setNextRun(date: Date | null): void {
		this._nextRun = date;
	}

	_isStopped(): boolean {
		return this._stopped;
	}

	async _triggerCallback(): Promise<void> {
		await this.callback();
	}

	_triggerCatchHandler(error: unknown): void {
		this.catchHandler?.(error, this);
	}
}

// Mock croner module
mock.module('croner', () => ({
	Cron: MockCron
}));

// Mock logger
const mockLoggerInfo = mock(() => {});
const mockLoggerError = mock(() => {});

mock.module('$lib/server/logging/logger', () => ({
	logger: {
		info: mockLoggerInfo,
		error: mockLoggerError,
		warn: mock(() => {}),
		debug: mock(() => {})
	}
}));

// Mock service functions
mockRunRetentionCleanup = mock(async () => ({ byAge: 5, byCount: 3 }));

mock.module('$lib/server/logging/service', () => ({
	runRetentionCleanup: mockRunRetentionCleanup,
	getLogRetentionDays: mock(async () => 30),
	getLogMaxCount: mock(async () => 10000)
}));

// Import after mocking
import {
	setupLogRetentionScheduler,
	stopLogRetentionScheduler,
	triggerRetentionCleanup,
	getRetentionSchedulerStatus,
	isRetentionSchedulerConfigured
} from '$lib/server/logging/retention';

describe('Log Retention Scheduler', () => {
	beforeEach(() => {
		// Reset mock tracking
		mockCronInstances = [];
		mockLoggerInfo.mockClear();
		mockLoggerError.mockClear();
		mockRunRetentionCleanup.mockClear();

		// Stop any existing scheduler
		stopLogRetentionScheduler();
	});

	afterEach(() => {
		// Cleanup
		stopLogRetentionScheduler();
	});

	describe('setupLogRetentionScheduler', () => {
		it('creates scheduler with default cron expression and timezone', () => {
			const scheduler = setupLogRetentionScheduler();

			expect(scheduler).toBeDefined();
			expect(mockCronInstances.length).toBe(1);

			const cronInstance = mockCronInstances[0];
			expect(cronInstance?.expression).toBe('0 3 * * *'); // Default: 3 AM daily
			expect(cronInstance?.timezone).toBe('UTC');
			expect(cronInstance?.name).toBe('log-retention');
		});

		it('creates scheduler with custom cron expression', () => {
			const customCron = '0 6 * * *'; // 6 AM
			setupLogRetentionScheduler(customCron);

			expect(mockCronInstances.length).toBe(1);
			expect(mockCronInstances[0]?.expression).toBe(customCron);
		});

		it('creates scheduler with custom timezone', () => {
			const customTimezone = 'America/New_York';
			setupLogRetentionScheduler('0 3 * * *', customTimezone);

			expect(mockCronInstances.length).toBe(1);
			expect(mockCronInstances[0]?.timezone).toBe(customTimezone);
		});

		it('stops existing scheduler when setting up new one', () => {
			// Setup first scheduler
			setupLogRetentionScheduler();
			const firstScheduler = mockCronInstances[0];

			// Setup second scheduler (should stop first)
			setupLogRetentionScheduler('0 6 * * *');

			expect(mockCronInstances.length).toBe(2);
			expect(firstScheduler?._isStopped()).toBe(true);
		});

		it('logs configuration message', () => {
			setupLogRetentionScheduler('0 3 * * *', 'UTC');

			expect(mockLoggerInfo).toHaveBeenCalled();
			const callArgs = mockLoggerInfo.mock.calls[0];
			expect(callArgs?.[0]).toContain('Log retention scheduler configured');
			expect(callArgs?.[0]).toContain('0 3 * * *');
			expect(callArgs?.[0]).toContain('UTC');
		});

		it('callback logs start and completion of cleanup', async () => {
			setupLogRetentionScheduler();
			const cronInstance = mockCronInstances[0];

			// Trigger the callback
			await cronInstance?._triggerCallback();

			// Should have logged start and completion
			const infoCalls = mockLoggerInfo.mock.calls;
			expect(
				infoCalls.some((call) => (call[0] as string).includes('Starting log retention cleanup'))
			).toBe(true);
			expect(
				infoCalls.some((call) => (call[0] as string).includes('Retention cleanup completed'))
			).toBe(true);
		});

		it('callback logs error when cleanup fails', async () => {
			// Make cleanup fail
			mockRunRetentionCleanup.mockImplementation(async () => {
				throw new Error('Database error');
			});

			setupLogRetentionScheduler();
			const cronInstance = mockCronInstances[0];

			// Trigger the callback
			await cronInstance?._triggerCallback();

			// Should have logged error
			expect(mockLoggerError).toHaveBeenCalled();
			const errorCall = mockLoggerError.mock.calls[0];
			expect(errorCall?.[0]).toContain('Retention cleanup failed');

			// Reset mock
			mockRunRetentionCleanup.mockImplementation(async () => ({ byAge: 5, byCount: 3 }));
		});

		it('catch handler logs job failures', () => {
			setupLogRetentionScheduler();
			const cronInstance = mockCronInstances[0];

			// Trigger the catch handler
			cronInstance?._triggerCatchHandler(new Error('Cron error'));

			// Should have logged error
			expect(mockLoggerError).toHaveBeenCalled();
			const errorCall = mockLoggerError.mock.calls[0];
			expect(errorCall?.[0]).toContain('Log retention job');
			expect(errorCall?.[0]).toContain('failed');
		});
	});

	describe('stopLogRetentionScheduler', () => {
		it('stops a running scheduler', () => {
			setupLogRetentionScheduler();
			const scheduler = mockCronInstances[0];

			stopLogRetentionScheduler();

			expect(scheduler?._isStopped()).toBe(true);
		});

		it('is idempotent when no scheduler exists', () => {
			// Should not throw
			expect(() => stopLogRetentionScheduler()).not.toThrow();
		});

		it('logs stop message when scheduler exists', () => {
			setupLogRetentionScheduler();
			mockLoggerInfo.mockClear();

			stopLogRetentionScheduler();

			expect(mockLoggerInfo).toHaveBeenCalled();
			const callArgs = mockLoggerInfo.mock.calls[0];
			expect(callArgs?.[0]).toContain('Log retention scheduler stopped');
		});

		it('does not log when no scheduler exists', () => {
			mockLoggerInfo.mockClear();

			stopLogRetentionScheduler();

			// No stop log should be emitted since there's no scheduler
			const stopLogCalls = mockLoggerInfo.mock.calls.filter((call) =>
				(call[0] as string).includes('stopped')
			);
			expect(stopLogCalls.length).toBe(0);
		});
	});

	describe('triggerRetentionCleanup', () => {
		it('calls runRetentionCleanup and returns result', async () => {
			const result = await triggerRetentionCleanup();

			expect(mockRunRetentionCleanup).toHaveBeenCalled();
			expect(result).toEqual({ byAge: 5, byCount: 3 });
		});

		it('logs manual trigger', async () => {
			mockLoggerInfo.mockClear();

			await triggerRetentionCleanup();

			expect(mockLoggerInfo).toHaveBeenCalled();
			const callArgs = mockLoggerInfo.mock.calls[0];
			expect(callArgs?.[0]).toContain('Manual log retention cleanup triggered');
		});
	});

	describe('getRetentionSchedulerStatus', () => {
		it('returns not configured when no scheduler exists', () => {
			const status = getRetentionSchedulerStatus();

			expect(status).toEqual({
				isConfigured: false,
				isRunning: false,
				nextRun: null,
				previousRun: null
			});
		});

		it('returns configured status when scheduler exists', () => {
			setupLogRetentionScheduler();

			const status = getRetentionSchedulerStatus();

			expect(status.isConfigured).toBe(true);
			expect(status.isRunning).toBe(true);
			expect(status.nextRun).toBeInstanceOf(Date);
		});

		it('reflects isRunning state', () => {
			setupLogRetentionScheduler();
			const cronInstance = mockCronInstances[0];

			// Initially running
			expect(getRetentionSchedulerStatus().isRunning).toBe(true);

			// Stop it
			cronInstance?._setIsRunning(false);
			expect(getRetentionSchedulerStatus().isRunning).toBe(false);
		});

		it('returns previousRun when available', () => {
			setupLogRetentionScheduler();
			const cronInstance = mockCronInstances[0];
			const previousDate = new Date(Date.now() - 86400000); // Yesterday

			cronInstance?._setPreviousRun(previousDate);

			const status = getRetentionSchedulerStatus();
			expect(status.previousRun).toEqual(previousDate);
		});

		it('returns null nextRun when scheduler returns undefined', () => {
			setupLogRetentionScheduler();
			const cronInstance = mockCronInstances[0];

			cronInstance?._setNextRun(null);

			const status = getRetentionSchedulerStatus();
			expect(status.nextRun).toBeNull();
		});
	});

	describe('isRetentionSchedulerConfigured', () => {
		it('returns false when no scheduler exists', () => {
			expect(isRetentionSchedulerConfigured()).toBe(false);
		});

		it('returns true when scheduler exists', () => {
			setupLogRetentionScheduler();
			expect(isRetentionSchedulerConfigured()).toBe(true);
		});

		it('returns false after scheduler is stopped', () => {
			setupLogRetentionScheduler();
			stopLogRetentionScheduler();
			expect(isRetentionSchedulerConfigured()).toBe(false);
		});
	});
});
