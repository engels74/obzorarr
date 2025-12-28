import { db } from '$lib/server/db/client';
import { customSlides } from '$lib/server/db/schema';
import { eq, and, isNull, asc } from 'drizzle-orm';
import {
	SlideError,
	CreateCustomSlideSchema,
	UpdateCustomSlideSchema,
	type CustomSlide,
	type CreateCustomSlide,
	type UpdateCustomSlide
} from './types';
import { validateMarkdownSyntax } from './renderer';

export async function createCustomSlide(data: CreateCustomSlide): Promise<CustomSlide> {
	const parsed = CreateCustomSlideSchema.safeParse(data);
	if (!parsed.success) {
		const errors = parsed.error.flatten().fieldErrors;
		const firstError = Object.values(errors)[0]?.[0] ?? 'Invalid input';
		throw new SlideError(firstError, 'VALIDATION_ERROR');
	}

	const validData = parsed.data;

	const markdownValidation = validateMarkdownSyntax(validData.content);
	if (!markdownValidation.valid) {
		throw new SlideError(
			`Invalid Markdown: ${markdownValidation.errors.join(', ')}`,
			'MARKDOWN_INVALID'
		);
	}

	const result = await db
		.insert(customSlides)
		.values({
			title: validData.title,
			content: validData.content,
			enabled: validData.enabled ?? true,
			sortOrder: validData.sortOrder,
			year: validData.year ?? null
		})
		.returning();

	const record = result[0];
	if (!record) {
		throw new SlideError('Failed to create custom slide', 'CREATE_FAILED');
	}

	return {
		id: record.id,
		title: record.title,
		content: record.content,
		enabled: record.enabled ?? true,
		sortOrder: record.sortOrder,
		year: record.year
	};
}

export async function getAllCustomSlides(year?: number): Promise<CustomSlide[]> {
	let results;

	if (year !== undefined) {
		// Filter by specific year or null (all years)
		results = await db
			.select()
			.from(customSlides)
			.where(eq(customSlides.year, year))
			.orderBy(asc(customSlides.sortOrder));
	} else {
		results = await db.select().from(customSlides).orderBy(asc(customSlides.sortOrder));
	}

	return results.map((record) => ({
		id: record.id,
		title: record.title,
		content: record.content,
		enabled: record.enabled ?? true,
		sortOrder: record.sortOrder,
		year: record.year
	}));
}

// Retrieves slides that are:
// 1. Enabled
// 2. Either matching the specific year OR applicable to all years (year = null)
export async function getEnabledCustomSlides(year: number): Promise<CustomSlide[]> {
	// Get slides matching the year OR with null year (applicable to all years)
	const yearMatches = await db
		.select()
		.from(customSlides)
		.where(and(eq(customSlides.enabled, true), eq(customSlides.year, year)))
		.orderBy(asc(customSlides.sortOrder));

	const allYearSlides = await db
		.select()
		.from(customSlides)
		.where(and(eq(customSlides.enabled, true), isNull(customSlides.year)))
		.orderBy(asc(customSlides.sortOrder));

	// Combine and sort by sortOrder
	const combined = [...yearMatches, ...allYearSlides].sort((a, b) => a.sortOrder - b.sortOrder);

	return combined.map((record) => ({
		id: record.id,
		title: record.title,
		content: record.content,
		enabled: true,
		sortOrder: record.sortOrder,
		year: record.year
	}));
}

export async function getCustomSlideById(id: number): Promise<CustomSlide | null> {
	const result = await db.select().from(customSlides).where(eq(customSlides.id, id)).limit(1);

	const record = result[0];
	if (!record) {
		return null;
	}

	return {
		id: record.id,
		title: record.title,
		content: record.content,
		enabled: record.enabled ?? true,
		sortOrder: record.sortOrder,
		year: record.year
	};
}

export async function updateCustomSlide(
	id: number,
	updates: UpdateCustomSlide
): Promise<CustomSlide> {
	const parsed = UpdateCustomSlideSchema.safeParse(updates);
	if (!parsed.success) {
		const errors = parsed.error.flatten().fieldErrors;
		const firstError = Object.values(errors)[0]?.[0] ?? 'Invalid input';
		throw new SlideError(firstError, 'VALIDATION_ERROR');
	}

	const validUpdates = parsed.data;

	const existing = await getCustomSlideById(id);
	if (!existing) {
		throw new SlideError(`Custom slide not found with id: ${id}`, 'NOT_FOUND');
	}

	if (validUpdates.content !== undefined) {
		const markdownValidation = validateMarkdownSyntax(validUpdates.content);
		if (!markdownValidation.valid) {
			throw new SlideError(
				`Invalid Markdown: ${markdownValidation.errors.join(', ')}`,
				'MARKDOWN_INVALID'
			);
		}
	}

	const updateValues: Record<string, unknown> = {};

	if (validUpdates.title !== undefined) {
		updateValues.title = validUpdates.title;
	}
	if (validUpdates.content !== undefined) {
		updateValues.content = validUpdates.content;
	}
	if (validUpdates.enabled !== undefined) {
		updateValues.enabled = validUpdates.enabled;
	}
	if (validUpdates.sortOrder !== undefined) {
		updateValues.sortOrder = validUpdates.sortOrder;
	}
	if (validUpdates.year !== undefined) {
		updateValues.year = validUpdates.year;
	}

	if (Object.keys(updateValues).length > 0) {
		await db.update(customSlides).set(updateValues).where(eq(customSlides.id, id));
	}

	const updated = await getCustomSlideById(id);
	if (!updated) {
		throw new SlideError('Failed to retrieve updated slide', 'UPDATE_FAILED');
	}

	return updated;
}

export async function toggleCustomSlide(id: number): Promise<CustomSlide> {
	const existing = await getCustomSlideById(id);
	if (!existing) {
		throw new SlideError(`Custom slide not found with id: ${id}`, 'NOT_FOUND');
	}

	return updateCustomSlide(id, { enabled: !existing.enabled });
}

export async function deleteCustomSlide(id: number): Promise<void> {
	const existing = await getCustomSlideById(id);
	if (!existing) {
		throw new SlideError(`Custom slide not found with id: ${id}`, 'NOT_FOUND');
	}

	await db.delete(customSlides).where(eq(customSlides.id, id));
}

export function validateMarkdown(content: string): { valid: boolean; errors: string[] } {
	return validateMarkdownSyntax(content);
}

export async function getNextSortOrder(): Promise<number> {
	const allSlides = await getAllCustomSlides();
	if (allSlides.length === 0) {
		return 0;
	}

	const maxSortOrder = Math.max(...allSlides.map((s) => s.sortOrder));
	return maxSortOrder + 1;
}
