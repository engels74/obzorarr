import {
	DEFAULT_RATE_LIMIT,
	STALE_THRESHOLD_MS,
	type RateLimitConfig,
	type RateLimitResult,
	type RateLimitRecord
} from './types';

/**
 * Rate Limiting Service
 *
 * Implements IP-based rate limiting using an in-memory sliding window algorithm.
 * Designed for lightweight rate limiting on single-server deployments.
 *
 * Features:
 * - In-memory storage (no external dependencies)
 * - Sliding window algorithm for smooth rate limiting
 * - Automatic cleanup of stale entries to prevent memory leaks
 *
 * @module ratelimit/service
 */

// =============================================================================
// Storage
// =============================================================================

/**
 * In-memory store for rate limit records
 *
 * Key: IP address
 * Value: Record with count and window start time
 */
const rateLimitStore = new Map<string, RateLimitRecord>();

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Check if a request from an IP is allowed under rate limits
 *
 * Uses a sliding window algorithm:
 * - If no record exists or window expired, start fresh window
 * - If within window, increment count and check limit
 *
 * @param ip - The client IP address
 * @param config - Rate limit configuration (uses defaults if not provided)
 * @returns Rate limit result with allowed status and metadata
 *
 * @example
 * ```typescript
 * const result = checkRateLimit('192.168.1.1');
 * if (!result.allowed) {
 *   return fail(429, { error: 'Too many requests', retryAfter: result.retryAfter });
 * }
 * ```
 */
export function checkRateLimit(
	ip: string,
	config: RateLimitConfig = DEFAULT_RATE_LIMIT
): RateLimitResult {
	const now = Date.now();
	const record = rateLimitStore.get(ip);

	// Case 1: No record exists or window has expired - start fresh
	if (!record || now - record.windowStart >= config.windowMs) {
		rateLimitStore.set(ip, { count: 1, windowStart: now });
		return {
			allowed: true,
			remaining: config.maxRequests - 1,
			resetTime: now + config.windowMs
		};
	}

	// Case 2: Within window but limit exceeded
	if (record.count >= config.maxRequests) {
		const resetTime = record.windowStart + config.windowMs;
		const retryAfter = Math.ceil((resetTime - now) / 1000);
		return {
			allowed: false,
			remaining: 0,
			resetTime,
			retryAfter: Math.max(1, retryAfter) // At least 1 second
		};
	}

	// Case 3: Within window and limit not exceeded - increment
	record.count++;
	return {
		allowed: true,
		remaining: config.maxRequests - record.count,
		resetTime: record.windowStart + config.windowMs
	};
}

/**
 * Clean up stale rate limit entries to prevent memory leaks
 *
 * Removes entries older than STALE_THRESHOLD_MS (5 minutes).
 * Should be called periodically (e.g., every few minutes).
 *
 * @returns Number of entries cleaned up
 */
export function cleanupRateLimitStore(): number {
	const now = Date.now();
	let cleanedCount = 0;

	for (const [ip, record] of rateLimitStore) {
		if (now - record.windowStart > STALE_THRESHOLD_MS) {
			rateLimitStore.delete(ip);
			cleanedCount++;
		}
	}

	return cleanedCount;
}

/**
 * Get the current size of the rate limit store
 *
 * Useful for monitoring and debugging.
 *
 * @returns Number of IPs being tracked
 */
export function getRateLimitStoreSize(): number {
	return rateLimitStore.size;
}

/**
 * Clear all rate limit records
 *
 * Primarily for testing purposes.
 */
export function clearRateLimitStore(): void {
	rateLimitStore.clear();
}
