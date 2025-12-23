import { z } from 'zod';

/**
 * Rate Limiting Types
 *
 * Defines the types and schemas for IP-based rate limiting.
 *
 * @module ratelimit/types
 */

// =============================================================================
// Schemas
// =============================================================================

/**
 * Rate limit configuration schema
 */
export const RateLimitConfigSchema = z.object({
	/** Time window in milliseconds */
	windowMs: z.number().int().min(1000).default(60_000),
	/** Maximum requests allowed per window */
	maxRequests: z.number().int().min(1).default(10)
});

// =============================================================================
// Types
// =============================================================================

/**
 * Rate limit configuration
 */
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
	/** Whether the request is allowed */
	allowed: boolean;
	/** Remaining requests in current window */
	remaining: number;
	/** Unix timestamp when the window resets */
	resetTime: number;
	/** Seconds until retry is allowed (only if not allowed) */
	retryAfter?: number;
}

/**
 * Internal record for tracking rate limits
 */
export interface RateLimitRecord {
	/** Number of requests in current window */
	count: number;
	/** Timestamp when the window started */
	windowStart: number;
}

// =============================================================================
// Defaults
// =============================================================================

/**
 * Default rate limit configuration
 *
 * 10 requests per minute per IP
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
	windowMs: 60_000, // 1 minute
	maxRequests: 10 // 10 requests per minute
};

/**
 * Stale entry threshold for cleanup (5 minutes)
 */
export const STALE_THRESHOLD_MS = 5 * 60 * 1000;
