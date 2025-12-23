/**
 * Rate Limiting Module
 *
 * Provides IP-based rate limiting for protecting endpoints from abuse.
 *
 * @module ratelimit
 *
 * @example
 * ```typescript
 * import { checkRateLimit } from '$lib/server/ratelimit';
 *
 * // In a form action or API endpoint
 * const result = checkRateLimit(getClientAddress());
 * if (!result.allowed) {
 *   return fail(429, {
 *     error: 'Too many requests. Please try again later.',
 *     retryAfter: result.retryAfter
 *   });
 * }
 * ```
 */

// Types
export type { RateLimitConfig, RateLimitResult, RateLimitRecord } from './types';
export { RateLimitConfigSchema, DEFAULT_RATE_LIMIT, STALE_THRESHOLD_MS } from './types';

// Service
export {
	checkRateLimit,
	cleanupRateLimitStore,
	getRateLimitStoreSize,
	clearRateLimitStore
} from './service';
