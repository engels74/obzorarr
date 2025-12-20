import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad, Actions } from './$types';
import {
	initializeDefaultSlideConfig,
	getAllSlideConfigs,
	updateSlideConfig,
	reorderSlides,
	toggleSlide
} from '$lib/server/slides/config.service';
import {
	getAllCustomSlides,
	createCustomSlide,
	updateCustomSlide,
	deleteCustomSlide,
	getNextSortOrder
} from '$lib/server/slides/custom.service';
import { renderMarkdownSync } from '$lib/server/slides/renderer';
import type { SlideType } from '$lib/components/slides/types';
import {
	CreateCustomSlideSchema,
	UpdateCustomSlideSchema,
	SlideTypeSchema
} from '$lib/server/slides/types';

/**
 * Admin Slides Page Server
 *
 * Handles loading slide configurations and form actions for
 * managing slides and custom slides.
 *
 * Implements Requirements:
 * - 9.1: Admin can create custom slides with Markdown editor
 * - 9.4: Admin can reorder slides
 * - 9.5: Admin can toggle slides off
 * - 11.3: Slide configuration with toggle, reorder, preview
 */

export const load: PageServerLoad = async () => {
	// Initialize default config if needed
	await initializeDefaultSlideConfig();

	// Load all configurations
	const [configs, customSlides] = await Promise.all([getAllSlideConfigs(), getAllCustomSlides()]);

	// Pre-render custom slides for preview
	const customSlidesWithPreview = customSlides.map((slide) => ({
		...slide,
		renderedHtml: renderMarkdownSync(slide.content)
	}));

	return {
		configs,
		customSlides: customSlidesWithPreview
	};
};

export const actions: Actions = {
	/**
	 * Toggle a slide's enabled state
	 */
	toggleSlide: async ({ request }) => {
		const formData = await request.formData();
		const slideType = formData.get('slideType');

		const parsed = SlideTypeSchema.safeParse(slideType);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid slide type' });
		}

		try {
			await toggleSlide(parsed.data as SlideType);
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to toggle slide';
			return fail(500, { error: message });
		}
	},

	/**
	 * Reorder slides
	 */
	reorder: async ({ request }) => {
		const formData = await request.formData();
		const orderJson = formData.get('order');

		if (typeof orderJson !== 'string') {
			return fail(400, { error: 'Invalid order data' });
		}

		try {
			const order = JSON.parse(orderJson) as string[];

			// Validate each slide type
			for (const type of order) {
				const parsed = SlideTypeSchema.safeParse(type);
				if (!parsed.success) {
					return fail(400, { error: `Invalid slide type: ${type}` });
				}
			}

			await reorderSlides(order as SlideType[]);
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to reorder slides';
			return fail(500, { error: message });
		}
	},

	/**
	 * Update slide configuration
	 */
	updateConfig: async ({ request }) => {
		const formData = await request.formData();
		const slideType = formData.get('slideType');
		const enabled = formData.get('enabled') === 'true';
		const sortOrderStr = formData.get('sortOrder');

		const parsed = SlideTypeSchema.safeParse(slideType);
		if (!parsed.success) {
			return fail(400, { error: 'Invalid slide type' });
		}

		try {
			const updates: { enabled?: boolean; sortOrder?: number } = { enabled };
			if (sortOrderStr) {
				updates.sortOrder = parseInt(sortOrderStr as string, 10);
			}

			await updateSlideConfig(parsed.data as SlideType, updates);
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update slide config';
			return fail(500, { error: message });
		}
	},

	/**
	 * Create a custom slide
	 */
	createCustom: async ({ request }) => {
		const formData = await request.formData();
		const title = formData.get('title');
		const content = formData.get('content');
		const enabled = formData.get('enabled') !== 'false';
		const yearStr = formData.get('year');

		// Get next sort order
		const sortOrder = await getNextSortOrder();

		const data = {
			title,
			content,
			enabled,
			sortOrder,
			year: yearStr ? parseInt(yearStr as string, 10) : null
		};

		const parsed = CreateCustomSlideSchema.safeParse(data);
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { error: 'Validation failed', fieldErrors: errors });
		}

		try {
			const slide = await createCustomSlide(parsed.data);
			return { success: true, slide };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to create custom slide';
			return fail(500, { error: message });
		}
	},

	/**
	 * Update a custom slide
	 */
	updateCustom: async ({ request }) => {
		const formData = await request.formData();
		const idStr = formData.get('id');
		const title = formData.get('title');
		const content = formData.get('content');
		const enabled = formData.get('enabled');
		const yearStr = formData.get('year');

		if (!idStr) {
			return fail(400, { error: 'Missing slide ID' });
		}

		const id = parseInt(idStr as string, 10);
		if (isNaN(id)) {
			return fail(400, { error: 'Invalid slide ID' });
		}

		const updates: Record<string, unknown> = {};
		if (title) updates.title = title;
		if (content) updates.content = content;
		if (enabled !== null) updates.enabled = enabled === 'true';
		if (yearStr !== null) {
			updates.year = yearStr === '' ? null : parseInt(yearStr as string, 10);
		}

		const parsed = UpdateCustomSlideSchema.safeParse(updates);
		if (!parsed.success) {
			const errors = parsed.error.flatten().fieldErrors;
			return fail(400, { error: 'Validation failed', fieldErrors: errors });
		}

		try {
			const slide = await updateCustomSlide(id, parsed.data);
			return { success: true, slide };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update custom slide';
			return fail(500, { error: message });
		}
	},

	/**
	 * Delete a custom slide
	 */
	deleteCustom: async ({ request }) => {
		const formData = await request.formData();
		const idStr = formData.get('id');

		if (!idStr) {
			return fail(400, { error: 'Missing slide ID' });
		}

		const id = parseInt(idStr as string, 10);
		if (isNaN(id)) {
			return fail(400, { error: 'Invalid slide ID' });
		}

		try {
			await deleteCustomSlide(id);
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to delete custom slide';
			return fail(500, { error: message });
		}
	},

	/**
	 * Preview Markdown content
	 */
	previewMarkdown: async ({ request }) => {
		const formData = await request.formData();
		const content = formData.get('content');

		if (typeof content !== 'string') {
			return fail(400, { error: 'Invalid content' });
		}

		try {
			const html = renderMarkdownSync(content);
			return { success: true, html };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to render Markdown';
			return fail(500, { error: message });
		}
	}
};
