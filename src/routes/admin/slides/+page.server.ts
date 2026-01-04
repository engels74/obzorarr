import { fail } from '@sveltejs/kit';
import type { SlideType } from '$lib/components/slides/types';
import {
	FunFactFrequency,
	type FunFactFrequencyType,
	getFunFactFrequency,
	setFunFactFrequency
} from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';
import {
	getAllSlideConfigs,
	initializeDefaultSlideConfig,
	toggleSlide,
	updateSlideConfig
} from '$lib/server/slides/config.service';
import {
	createCustomSlide,
	deleteCustomSlide,
	getAllCustomSlides,
	getNextSortOrder,
	toggleCustomSlide,
	updateCustomSlide
} from '$lib/server/slides/custom.service';
import { renderMarkdownSync } from '$lib/server/slides/renderer';
import {
	CreateCustomSlideSchema,
	SlideTypeSchema,
	UpdateCustomSlideSchema
} from '$lib/server/slides/types';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Initialize default config if needed
	await initializeDefaultSlideConfig();

	// Load all configurations
	const [configs, customSlides, funFactFrequency, availableYears] = await Promise.all([
		getAllSlideConfigs(),
		getAllCustomSlides(),
		getFunFactFrequency(),
		getAvailableYears()
	]);

	// Pre-render custom slides for preview
	const customSlidesWithPreview = customSlides.map((slide) => ({
		...slide,
		renderedHtml: renderMarkdownSync(slide.content)
	}));

	return {
		configs,
		customSlides: customSlidesWithPreview,
		funFactFrequency,
		availableYears
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
	 * Reorder slides - supports unified ordering of built-in and custom slides
	 *
	 * Handles the new unified format: [{ type: 'builtin' | 'custom', id: string | number }]
	 * Both built-in and custom slides share the same global sortOrder space.
	 */
	reorder: async ({ request }) => {
		const formData = await request.formData();
		const orderJson = formData.get('order');

		if (typeof orderJson !== 'string') {
			return fail(400, { error: 'Invalid order data' });
		}

		try {
			const order = JSON.parse(orderJson) as Array<{
				type: 'builtin' | 'custom';
				id: string | number;
			}>;

			// Process each item and update its sortOrder to match its position in the array
			const builtInUpdates: Array<{ type: SlideType; sortOrder: number }> = [];
			const customSlideUpdates: Array<{ id: number; sortOrder: number }> = [];

			for (let i = 0; i < order.length; i++) {
				const item = order[i];
				if (!item) continue;

				if (item.type === 'builtin') {
					// Validate the slide type
					const parsed = SlideTypeSchema.safeParse(item.id);
					if (!parsed.success) {
						return fail(400, { error: `Invalid slide type: ${item.id}` });
					}
					builtInUpdates.push({ type: item.id as SlideType, sortOrder: i });
				} else if (item.type === 'custom') {
					// Custom slide - store its new sort order
					const customId = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;
					if (Number.isNaN(customId)) {
						return fail(400, { error: `Invalid custom slide ID: ${item.id}` });
					}
					customSlideUpdates.push({ id: customId, sortOrder: i });
				}
			}

			// Update built-in slides with their global sort orders
			for (const update of builtInUpdates) {
				await updateSlideConfig(update.type, { sortOrder: update.sortOrder });
			}

			// Update custom slides with their global sort orders
			for (const update of customSlideUpdates) {
				await updateCustomSlide(update.id, { sortOrder: update.sortOrder });
			}

			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to reorder slides';
			return fail(500, { error: message });
		}
	},

	/**
	 * Toggle a custom slide's enabled state
	 */
	toggleCustomSlide: async ({ request }) => {
		const formData = await request.formData();
		const idStr = formData.get('id');

		if (!idStr) {
			return fail(400, { error: 'Missing slide ID' });
		}

		const id = parseInt(idStr as string, 10);
		if (Number.isNaN(id)) {
			return fail(400, { error: 'Invalid slide ID' });
		}

		try {
			await toggleCustomSlide(id);
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to toggle custom slide';
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
		if (Number.isNaN(id)) {
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
		if (Number.isNaN(id)) {
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
	},

	/**
	 * Set fun fact frequency
	 */
	setFunFactFrequency: async ({ request }) => {
		const formData = await request.formData();
		const mode = formData.get('mode');
		const customCountStr = formData.get('customCount');

		// Validate mode
		const validModes = Object.values(FunFactFrequency);
		if (typeof mode !== 'string' || !validModes.includes(mode as FunFactFrequencyType)) {
			return fail(400, { error: 'Invalid frequency mode' });
		}

		// Parse custom count if provided
		let customCount: number | undefined;
		if (mode === FunFactFrequency.CUSTOM && customCountStr) {
			customCount = parseInt(customCountStr as string, 10);
			if (Number.isNaN(customCount) || customCount < 1 || customCount > 15) {
				return fail(400, { error: 'Custom count must be between 1 and 15' });
			}
		}

		try {
			await setFunFactFrequency(mode as FunFactFrequencyType, customCount);
			return { success: true };
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to update frequency';
			return fail(500, { error: message });
		}
	}
};
