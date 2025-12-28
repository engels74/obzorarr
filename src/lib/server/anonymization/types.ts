import { z } from 'zod';

export const AnonymizationMode = {
	REAL: 'real',
	ANONYMOUS: 'anonymous',
	HYBRID: 'hybrid'
} as const;

export type AnonymizationModeType = (typeof AnonymizationMode)[keyof typeof AnonymizationMode];

export const AnonymizationSettingsKey = {
	DEFAULT_MODE: 'anonymization_mode',
	PER_STAT_SETTINGS: 'anonymization_per_stat'
} as const;

export const AnonymizationModeSchema = z.enum(['real', 'anonymous', 'hybrid']);

export const PerStatAnonymizationSettingsSchema = z.object({
	topViewers: AnonymizationModeSchema.optional()
});

export const AnonymizationConfigSchema = z.object({
	defaultMode: AnonymizationModeSchema.default('real'),
	perStat: PerStatAnonymizationSettingsSchema.optional()
});

export type PerStatAnonymizationSettings = z.infer<typeof PerStatAnonymizationSettingsSchema>;
export type AnonymizationConfig = z.infer<typeof AnonymizationConfigSchema>;

export interface AnonymizableUser {
	userId: number;
	username: string;
}

export interface AnonymizationContext {
	mode: AnonymizationModeType;
	viewingUserId: number | null;
}
