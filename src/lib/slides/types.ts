import { z } from 'zod';

export const SlideTypeSchema = z.enum([
	'total-time',
	'top-movies',
	'top-shows',
	'genres',
	'distribution',
	'percentile',
	'binge',
	'first-last',
	'custom'
]);

export type SlideTypeValue = z.infer<typeof SlideTypeSchema>;

export const UpdateSlideConfigSchema = z.object({
	enabled: z.boolean().optional(),
	sortOrder: z.number().int().nonnegative().optional()
});

export type UpdateSlideConfig = z.infer<typeof UpdateSlideConfigSchema>;

export const CreateCustomSlideSchema = z.object({
	title: z.string().min(1).max(200),
	content: z.string().min(1).max(10000),
	enabled: z.boolean().default(true),
	sortOrder: z.number().int().nonnegative(),
	year: z.number().int().min(2000).max(2100).nullable().optional()
});

export type CreateCustomSlide = z.infer<typeof CreateCustomSlideSchema>;

export const UpdateCustomSlideSchema = z.object({
	title: z.string().min(1).max(200).optional(),
	content: z.string().min(1).max(10000).optional(),
	enabled: z.boolean().optional(),
	sortOrder: z.number().int().nonnegative().optional(),
	year: z.number().int().min(2000).max(2100).nullable().optional()
});

export type UpdateCustomSlide = z.infer<typeof UpdateCustomSlideSchema>;

export interface SlideConfig {
	id: number;
	slideType: SlideTypeValue;
	enabled: boolean;
	sortOrder: number;
}

export interface CustomSlide {
	id: number;
	title: string;
	content: string;
	enabled: boolean;
	sortOrder: number;
	year: number | null;
}

export interface RenderedSlide {
	type: SlideTypeValue;
	sortOrder: number;
	customSlideId?: number;
}

export interface MarkdownValidationResult {
	valid: boolean;
	errors: string[];
}
