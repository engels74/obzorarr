import { z } from 'zod';

export const RateLimitConfigSchema = z.object({
	name: z.string().min(1),
	windowMs: z.number().int().min(1000).default(60_000),
	maxRequests: z.number().int().min(1).default(10)
});

export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetTime: number;
	retryAfter?: number;
}

export interface RateLimitRecord {
	count: number;
	windowStart: number;
}

export const FALLBACK_RATE_LIMIT: RateLimitConfig = {
	name: 'fallback',
	windowMs: 60_000,
	maxRequests: 10
};

export const RATE_LIMIT_CONFIGS = {
	default: { name: 'default', windowMs: 60_000, maxRequests: 60 },
	auth: { name: 'auth', windowMs: 300_000, maxRequests: 10 },
	authPoll: { name: 'authPoll', windowMs: 60_000, maxRequests: 60 },
	authRedirect: { name: 'authRedirect', windowMs: 60_000, maxRequests: 30 },
	api: { name: 'api', windowMs: 60_000, maxRequests: 30 }
} as const satisfies Record<string, RateLimitConfig>;

export const STALE_THRESHOLD_MS = 5 * 60 * 1000;
