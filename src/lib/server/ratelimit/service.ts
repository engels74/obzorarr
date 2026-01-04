import {
	FALLBACK_RATE_LIMIT,
	type RateLimitConfig,
	type RateLimitRecord,
	type RateLimitResult,
	STALE_THRESHOLD_MS
} from './types';

const rateLimitStore = new Map<string, RateLimitRecord>();

export function checkRateLimit(
	ip: string,
	config: RateLimitConfig = FALLBACK_RATE_LIMIT
): RateLimitResult {
	const now = Date.now();
	const record = rateLimitStore.get(ip);

	if (!record || now - record.windowStart >= config.windowMs) {
		rateLimitStore.set(ip, { count: 1, windowStart: now });
		return {
			allowed: true,
			remaining: config.maxRequests - 1,
			resetTime: now + config.windowMs
		};
	}

	if (record.count >= config.maxRequests) {
		const resetTime = record.windowStart + config.windowMs;
		const retryAfter = Math.ceil((resetTime - now) / 1000);
		return {
			allowed: false,
			remaining: 0,
			resetTime,
			retryAfter: Math.max(1, retryAfter)
		};
	}

	record.count++;
	return {
		allowed: true,
		remaining: config.maxRequests - record.count,
		resetTime: record.windowStart + config.windowMs
	};
}

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

export function getRateLimitStoreSize(): number {
	return rateLimitStore.size;
}

export function clearRateLimitStore(): void {
	rateLimitStore.clear();
}
