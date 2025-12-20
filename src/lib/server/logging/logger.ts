import { insertLogsBatch, isDebugEnabled } from './service';
import { LogLevel, type LogLevelType, type NewLogEntry } from './types';

/**
 * Logger
 *
 * A production-ready logger with batched database writes.
 * Provides debug, info, warn, and error methods.
 *
 * Features:
 * - Batched writes (flush every 100ms or 50 entries)
 * - Respects DEBUG level setting
 * - Also outputs to console for stdout/stderr capture
 * - Non-blocking async writes
 */

// =============================================================================
// Configuration
// =============================================================================

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 100;

// =============================================================================
// Logger Class
// =============================================================================

class Logger {
	private buffer: NewLogEntry[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private isFlushing = false;
	private debugEnabledCache: boolean | null = null;
	private debugCacheExpiry = 0;
	private readonly DEBUG_CACHE_TTL_MS = 30000; // Cache debug setting for 30s

	/**
	 * Log a debug message
	 * Only persisted if debug logging is enabled in settings
	 */
	async debug(message: string, source?: string, metadata?: Record<string, unknown>): Promise<void> {
		// Check if debug is enabled (with caching)
		const debugEnabled = await this.isDebugEnabled();
		if (!debugEnabled) {
			// Still output to console for development
			console.debug(`[${source ?? 'App'}] ${message}`);
			return;
		}

		this.addToBuffer({ level: LogLevel.DEBUG, message, source, metadata });
		console.debug(`[${source ?? 'App'}] ${message}`);
	}

	/**
	 * Log an info message
	 */
	info(message: string, source?: string, metadata?: Record<string, unknown>): void {
		this.addToBuffer({ level: LogLevel.INFO, message, source, metadata });
		console.log(`[${source ?? 'App'}] ${message}`);
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, source?: string, metadata?: Record<string, unknown>): void {
		this.addToBuffer({ level: LogLevel.WARN, message, source, metadata });
		console.warn(`[${source ?? 'App'}] ${message}`);
	}

	/**
	 * Log an error message
	 */
	error(message: string, source?: string, metadata?: Record<string, unknown>): void {
		this.addToBuffer({ level: LogLevel.ERROR, message, source, metadata });
		console.error(`[${source ?? 'App'}] ${message}`);
	}

	/**
	 * Add an entry to the buffer and schedule flush
	 */
	private addToBuffer(entry: NewLogEntry): void {
		this.buffer.push(entry);

		// Flush immediately if buffer is full
		if (this.buffer.length >= BATCH_SIZE) {
			this.flush();
			return;
		}

		// Schedule flush if not already scheduled
		if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => {
				this.flushTimer = null;
				this.flush();
			}, FLUSH_INTERVAL_MS);
		}
	}

	/**
	 * Flush the buffer to the database
	 */
	private async flush(): Promise<void> {
		if (this.isFlushing || this.buffer.length === 0) {
			return;
		}

		// Clear any pending timer
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}

		this.isFlushing = true;

		// Take current buffer and reset
		const entries = this.buffer;
		this.buffer = [];

		try {
			await insertLogsBatch(entries);
		} catch (error) {
			// Log to console but don't re-buffer (avoid infinite loop)
			console.error('[Logger] Failed to flush logs to database:', error);
		} finally {
			this.isFlushing = false;
		}
	}

	/**
	 * Check if debug logging is enabled (with caching)
	 */
	private async isDebugEnabled(): Promise<boolean> {
		const now = Date.now();

		// Return cached value if still valid
		if (this.debugEnabledCache !== null && now < this.debugCacheExpiry) {
			return this.debugEnabledCache;
		}

		// Refresh cache
		try {
			this.debugEnabledCache = await isDebugEnabled();
			this.debugCacheExpiry = now + this.DEBUG_CACHE_TTL_MS;
		} catch {
			// On error, default to false
			this.debugEnabledCache = false;
			this.debugCacheExpiry = now + this.DEBUG_CACHE_TTL_MS;
		}

		return this.debugEnabledCache;
	}

	/**
	 * Force flush any pending logs (useful for shutdown)
	 */
	async forceFlush(): Promise<void> {
		await this.flush();
	}

	/**
	 * Clear the debug enabled cache (call after settings change)
	 */
	clearDebugCache(): void {
		this.debugEnabledCache = null;
		this.debugCacheExpiry = 0;
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

/**
 * Singleton logger instance
 *
 * Usage:
 * ```typescript
 * import { logger } from '$lib/server/logging';
 *
 * logger.info('Starting sync', 'Scheduler');
 * logger.error('Sync failed', 'Sync', { error: error.message });
 * logger.warn('Rate limited', 'PlexAPI', { retryAfter: 60 });
 * await logger.debug('Processing item', 'Sync', { itemId: 123 });
 * ```
 */
export const logger = new Logger();
