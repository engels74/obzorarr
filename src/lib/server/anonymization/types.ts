import { z } from 'zod';

/**
 * Anonymization Service Types
 *
 * Type definitions for the anonymization system that controls
 * how usernames appear in server-wide statistics.
 *
 * @module anonymization/types
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Valid anonymization modes for wrapped pages
 */
export const AnonymizationMode = {
	REAL: 'real',
	ANONYMOUS: 'anonymous',
	HYBRID: 'hybrid'
} as const;

export type AnonymizationModeType = (typeof AnonymizationMode)[keyof typeof AnonymizationMode];

/**
 * App settings keys for anonymization configuration
 */
export const AnonymizationSettingsKey = {
	DEFAULT_MODE: 'anonymization_mode',
	PER_STAT_SETTINGS: 'anonymization_per_stat'
} as const;

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * Schema for anonymization mode validation
 */
export const AnonymizationModeSchema = z.enum(['real', 'anonymous', 'hybrid']);

/**
 * Schema for per-stat anonymization settings
 *
 * Allows different anonymization modes for different statistics.
 * Currently only topViewers contains usernames, but this is extensible.
 */
export const PerStatAnonymizationSettingsSchema = z.object({
	topViewers: AnonymizationModeSchema.optional()
	// Future: add other stats that might need anonymization
});

/**
 * Schema for global anonymization configuration
 */
export const AnonymizationConfigSchema = z.object({
	defaultMode: AnonymizationModeSchema.default('real'),
	perStat: PerStatAnonymizationSettingsSchema.optional()
});

// =============================================================================
// TypeScript Types (inferred from Zod schemas)
// =============================================================================

export type PerStatAnonymizationSettings = z.infer<typeof PerStatAnonymizationSettingsSchema>;
export type AnonymizationConfig = z.infer<typeof AnonymizationConfigSchema>;

/**
 * Interface for objects that can be anonymized
 *
 * Any object with userId and username fields can be anonymized.
 */
export interface AnonymizableUser {
	userId: number;
	username: string;
}

/**
 * Context for applying anonymization
 */
export interface AnonymizationContext {
	/** The anonymization mode to apply */
	mode: AnonymizationModeType;
	/** The ID of the user viewing the page (null if unauthenticated) */
	viewingUserId: number | null;
}
