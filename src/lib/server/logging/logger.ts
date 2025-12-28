import { insertLogsBatch, isDebugEnabled } from './service';
import { LogLevel, type LogLevelType, type NewLogEntry } from './types';

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 100;

class Logger {
	private buffer: NewLogEntry[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private isFlushing = false;
	private debugEnabledCache: boolean | null = null;
	private debugCacheExpiry = 0;
	private readonly DEBUG_CACHE_TTL_MS = 30000;

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

	info(message: string, source?: string, metadata?: Record<string, unknown>): void {
		this.addToBuffer({ level: LogLevel.INFO, message, source, metadata });
		console.log(`[${source ?? 'App'}] ${message}`);
	}

	warn(message: string, source?: string, metadata?: Record<string, unknown>): void {
		this.addToBuffer({ level: LogLevel.WARN, message, source, metadata });
		console.warn(`[${source ?? 'App'}] ${message}`);
	}

	error(message: string, source?: string, metadata?: Record<string, unknown>): void {
		this.addToBuffer({ level: LogLevel.ERROR, message, source, metadata });
		console.error(`[${source ?? 'App'}] ${message}`);
	}

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

		// Take current buffer (keep reference for potential restore)
		const entries = this.buffer;
		this.buffer = [];

		try {
			await insertLogsBatch(entries);
		} catch (error) {
			// Restore entries to buffer on failure (at the start, to preserve order)
			// Only restore if the buffer hasn't grown too large (avoid memory issues)
			if (this.buffer.length + entries.length <= BATCH_SIZE * 2) {
				this.buffer = [...entries, ...this.buffer];
			}
			// Log to console for visibility
			console.error('[Logger] Failed to flush logs to database:', error);
		} finally {
			this.isFlushing = false;
		}
	}

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

	async forceFlush(): Promise<void> {
		await this.flush();
	}

	clearDebugCache(): void {
		this.debugEnabledCache = null;
		this.debugCacheExpiry = 0;
	}
}

export const logger = new Logger();
export { Logger };
