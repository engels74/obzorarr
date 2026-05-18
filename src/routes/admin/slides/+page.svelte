<script lang="ts">
import Pencil from '@lucide/svelte/icons/pencil';
import Plus from '@lucide/svelte/icons/plus';
import Trash2 from '@lucide/svelte/icons/trash-2';
import { untrack } from 'svelte';
import { enhance } from '$app/forms';
import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
import type { SlideType } from '$lib/components/slides/types';
import { DEFAULT_SLIDE_ORDER } from '$lib/components/slides/types';
import { Button } from '$lib/components/ui/button';
import { handleFormToast } from '$lib/utils/form-toast';
import { submitAction } from '$lib/utils/submit-action';
import type { ActionData, PageData } from './$types';

/**
 * Admin Slides Page
 *
 * Manages slide configuration (enable/disable, reordering)
 * and custom slides (create, edit, delete with Markdown).
 */

let { data, form }: { data: PageData; form: ActionData } = $props();

// Show toast notifications for form responses
$effect(() => {
	handleFormToast(form);
});

// ISSUE-016: surface fieldErrors next to the offending input — the toast alone
// only reported "Validation failed", which left the user guessing which field
// was over the 200-char limit. Mirrors the pattern used in admin/settings.
const slideFieldErrors = $derived(
	form && 'fieldErrors' in form
		? ((form as { fieldErrors?: Record<string, string[] | undefined> }).fieldErrors ?? undefined)
		: undefined
);

// Slide display names
const SLIDE_NAMES: Record<SlideType, string> = {
	'total-time': 'Total Watch Time',
	'top-movies': 'Top Movies',
	'top-shows': 'Top Shows',
	genres: 'Genre Breakdown',
	distribution: 'Viewing Distribution',
	percentile: 'Percentile / Top Contributors',
	binge: 'Longest Binge',
	'first-last': 'First & Last Watch',
	'weekday-patterns': 'Weekday Patterns',
	'content-type': 'Content Type',
	decade: 'Content Era',
	'series-completion': 'Series Progress',
	rewatch: 'Rewatched Content',
	marathon: 'Marathon Day',
	streak: 'Watching Streak',
	'year-comparison': 'Year Comparison',
	custom: 'Custom Slide'
};

// Fun Fact frequency state (synced from server data only when server data changes)
let selectedFrequencyMode = $state<typeof data.funFactFrequency.mode>(
	untrack(() => data.funFactFrequency.mode)
);
let customCount = $state(untrack(() => data.funFactFrequency.count));
let syncedFrequencyKey = $state(
	untrack(() => `${data.funFactFrequency.mode}:${data.funFactFrequency.count}`)
);

function selectFrequencyMode(mode: typeof data.funFactFrequency.mode): void {
	selectedFrequencyMode = mode;
}

// Avoid resetting the radio while the user is selecting Custom before submit.
$effect(() => {
	const frequencyKey = `${data.funFactFrequency.mode}:${data.funFactFrequency.count}`;
	if (frequencyKey === syncedFrequencyKey) return;

	selectedFrequencyMode = data.funFactFrequency.mode;
	customCount = data.funFactFrequency.count;
	syncedFrequencyKey = frequencyKey;
});

// State for custom slide editor
let showEditor = $state(false);
let editingSlide = $state<(typeof data.customSlides)[0] | null>(null);
let editorTitle = $state('');
let editorContent = $state('');
let editorYear = $state<number | null>(null);
let editorEnabled = $state(true);
let previewHtml = $state('');
let previewError = $state('');
let previewRendered = $state(false);
let editorTriggerRef: HTMLElement | null = null;
let editorTitleInputRef: HTMLInputElement | null = $state(null);
let editorModalRef: HTMLElement | null = $state(null);

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

function getEditorFocusableElements(): HTMLElement[] {
	if (!editorModalRef) return [];
	return Array.from(editorModalRef.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
		(element) => element.tabIndex >= 0 && element.getClientRects().length > 0
	);
}

function trapEditorFocus(event: KeyboardEvent) {
	if (event.key !== 'Tab') return;

	const focusableElements = getEditorFocusableElements();
	if (focusableElements.length === 0) {
		event.preventDefault();
		editorModalRef?.focus();
		return;
	}

	const first = focusableElements[0];
	const last = focusableElements.at(-1);
	const activeElement = document.activeElement;

	if (event.shiftKey && (activeElement === first || !editorModalRef?.contains(activeElement))) {
		event.preventDefault();
		last?.focus();
	} else if (
		!event.shiftKey &&
		(activeElement === last || !editorModalRef?.contains(activeElement))
	) {
		event.preventDefault();
		first?.focus();
	}
}

$effect(() => {
	if (!showEditor) return;
	const handler = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			closeEditor();
			return;
		}
		trapEditorFocus(e);
	};
	document.addEventListener('keydown', handler);
	queueMicrotask(() => editorTitleInputRef?.focus());
	return () => document.removeEventListener('keydown', handler);
});

// Delete confirmation state
let deletingSlideId = $state<number | null>(null);

// Drag and drop state
let draggedIndex = $state<number | null>(null);
let dragOverIndex = $state<number | null>(null);

// Unified slide item type for the combined list
type UnifiedSlideItem =
	| { kind: 'builtin'; slideType: string; enabled: boolean; sortOrder: number }
	| {
			kind: 'custom';
			id: number;
			title: string;
			enabled: boolean;
			sortOrder: number;
			year: number | null;
			content: string;
			renderedHtml?: string;
	  };

// Combine built-in slides and custom slides into a unified sorted list
const unifiedSlides = $derived.by(() => {
	const items: UnifiedSlideItem[] = [];

	// Add built-in slides (only those in DEFAULT_SLIDE_ORDER)
	for (const config of data.configs) {
		if (DEFAULT_SLIDE_ORDER.includes(config.slideType as SlideType)) {
			items.push({
				kind: 'builtin',
				slideType: config.slideType,
				enabled: config.enabled,
				sortOrder: config.sortOrder
			});
		}
	}

	// Add custom slides
	for (const custom of data.customSlides) {
		items.push({
			kind: 'custom',
			id: custom.id,
			title: custom.title,
			enabled: custom.enabled,
			sortOrder: custom.sortOrder,
			year: custom.year,
			content: custom.content,
			renderedHtml: custom.renderedHtml
		});
	}

	// Sort by sortOrder
	return items.sort((a, b) => a.sortOrder - b.sortOrder);
});

// Open editor for new slide
function openNewEditor() {
	editorTriggerRef = (document.activeElement as HTMLElement) ?? null;
	editingSlide = null;
	editorTitle = '';
	editorContent = '';
	editorYear = null; // Default to "All years"
	editorEnabled = true;
	previewHtml = '';
	previewError = '';
	previewRendered = false;
	showEditor = true;
}

// Open editor for existing slide
function openEditEditor(slide: (typeof data.customSlides)[0]) {
	editorTriggerRef = (document.activeElement as HTMLElement) ?? null;
	editingSlide = slide;
	editorTitle = slide.title;
	editorContent = slide.content;
	editorYear = slide.year;
	editorEnabled = slide.enabled;
	previewHtml = slide.renderedHtml ?? '';
	previewError = '';
	previewRendered = typeof slide.renderedHtml === 'string';
	showEditor = true;
}

// Close editor
function closeEditor() {
	showEditor = false;
	editingSlide = null;
	const trigger = editorTriggerRef;
	editorTriggerRef = null;
	queueMicrotask(() => trigger?.focus());
}

// Handle drag start
function handleDragStart(index: number) {
	draggedIndex = index;
}

// Handle drag over
function handleDragOver(event: DragEvent, index: number) {
	event.preventDefault();
	dragOverIndex = index;
}

// Handle drag end
function handleDragEnd() {
	draggedIndex = null;
	dragOverIndex = null;
}

// Handle drop - reorder unified slides
function handleDrop(event: DragEvent, dropIndex: number) {
	event.preventDefault();
	if (draggedIndex === null || draggedIndex === dropIndex) return;

	// Create new order from unified slides
	const newOrder = unifiedSlides.map((item) => {
		if (item.kind === 'builtin') {
			return { type: 'builtin' as const, id: item.slideType };
		} else {
			return { type: 'custom' as const, id: item.id };
		}
	});

	// Move the dragged item to the new position
	const [moved] = newOrder.splice(draggedIndex, 1);
	if (moved) {
		newOrder.splice(dropIndex, 0, moved);
	}

	// Submit the reorder form
	const form = document.getElementById('reorder-form') as HTMLFormElement;
	const orderInput = form.querySelector('input[name="order"]') as HTMLInputElement;
	orderInput.value = JSON.stringify(newOrder);
	form.requestSubmit();

	handleDragEnd();
}

// Get custom slide data for editing
function getCustomSlideForEdit(item: UnifiedSlideItem) {
	if (item.kind !== 'custom') return null;
	return data.customSlides.find((s) => s.id === item.id) ?? null;
}
</script>

<div class="admin-container">
	<div class="admin-page-content" inert={showEditor} aria-hidden={showEditor ? 'true' : undefined}>
	<header class="admin-header">
		<h1>Slide Configuration</h1>
		<p class="subtitle">Manage slides for Year in Review presentations</p>
	</header>

	<!-- Slide Order Section -->
	<section class="section">
		<div class="section-header">
			<div class="section-title-content">
				<h2>Slide Order</h2>
				<p class="section-description">
					Drag and drop to reorder. Toggle to enable or disable slides.
				</p>
			</div>
			<Button type="button" class="add-button tap-target" onclick={openNewEditor}>
				<Plus class="add-button-icon" />
				Add Custom Slide
			</Button>
		</div>

		<!-- Hidden form for reordering -->
		<form id="reorder-form" method="POST" action="?/reorder" use:enhance>
			<input type="hidden" name="order" value="" />
		</form>

		<ul class="slide-list" role="list">
			{#each unifiedSlides as item, index (item.kind === 'builtin' ? item.slideType : `custom-${item.id}`)}
				<li
					class="slide-item"
					class:dragging={draggedIndex === index}
					class:drag-over={dragOverIndex === index}
					class:is-custom={item.kind === 'custom'}
					draggable="true"
					ondragstart={() => handleDragStart(index)}
					ondragover={(e) => handleDragOver(e, index)}
					ondragend={handleDragEnd}
					ondrop={(e) => handleDrop(e, index)}
					role="listitem"
				>
					<span class="drag-handle" aria-hidden="true">⋮⋮</span>

					{#if item.kind === 'builtin'}
						<span class="slide-name">
							{SLIDE_NAMES[item.slideType as SlideType] ?? item.slideType}
						</span>

						<form method="POST" action="?/toggleSlide" use:enhance class="toggle-form">
							<input type="hidden" name="slideType" value={item.slideType} />
							<SubmitButton
								class={`toggle-button tap-target ${item.enabled ? 'enabled' : ''}`}
								aria-label={item.enabled ? 'Disable slide' : 'Enable slide'}
							>
								{#snippet children()}
									{item.enabled ? 'Enabled' : 'Disabled'}
								{/snippet}
							</SubmitButton>
						</form>
					{:else}
						<div class="slide-name-group">
							<span class="slide-name">{item.title}</span>
							<span class="custom-badge">Custom</span>
							{#if item.year}
								<span class="year-badge">{item.year}</span>
							{/if}
						</div>

						<div class="slide-actions">
							<Button
								type="button"
								class="action-button edit-action tap-target"
								onclick={() => {
									const slide = getCustomSlideForEdit(item);
									if (slide) openEditEditor(slide);
								}}
								aria-label="Edit custom slide"
							>
								<Pencil class="size-[14px]" />
							</Button>

							<form method="POST" action="?/toggleCustomSlide" use:enhance class="toggle-form">
								<input type="hidden" name="id" value={item.id} />
								<SubmitButton
									class={`toggle-button tap-target ${item.enabled ? 'enabled' : ''}`}
									aria-label={item.enabled ? 'Disable slide' : 'Enable slide'}
								>
									{#snippet children()}
										{item.enabled ? 'Enabled' : 'Disabled'}
									{/snippet}
								</SubmitButton>
							</form>

							{#if deletingSlideId === item.id}
								<div class="confirm-delete">
									<span class="confirm-delete-text">
										Delete <strong>"{item.title}"</strong> permanently?
									</span>
									<form method="POST" action="?/deleteCustom" use:enhance class="delete-form">
										<input type="hidden" name="id" value={item.id} />
										<SubmitButton
											class="confirm-button tap-target"
											aria-label={`Confirm delete "${item.title}"`}
										>
											{#snippet children()}
												Delete
											{/snippet}
										</SubmitButton>
									</form>
									<Button
										type="button"
										class="cancel-delete-button tap-target"
										onclick={() => (deletingSlideId = null)}
									>
										Cancel
									</Button>
								</div>
							{:else}
								<form
									method="POST"
									action="?/deleteCustom"
									use:enhance
									class="delete-trigger-form"
									onsubmit={(e) => {
										e.preventDefault();
										deletingSlideId = item.id;
									}}
								>
									<input type="hidden" name="id" value={item.id} />
									<SubmitButton
										class="action-button delete-action tap-target"
										aria-label="Delete custom slide"
									>
										{#snippet children()}
											<Trash2 class="size-[14px]" />
										{/snippet}
									</SubmitButton>
								</form>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if unifiedSlides.length === 0}
			<p class="empty-message">No slides configured yet.</p>
		{/if}
	</section>

	<!-- Fun Fact Frequency Section -->
	<section class="section">
		<h2>Fun Fact Frequency</h2>
		<p class="section-description">
			Control how many fun facts appear interspersed throughout the wrapped presentation.
		</p>

		<form
			method="POST"
			action="?/setFunFactFrequency"
			use:enhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success' && result.data?.funFactFrequency) {
						const frequency = result.data.funFactFrequency as typeof data.funFactFrequency;
						selectedFrequencyMode = frequency.mode;
						customCount = frequency.count;
						syncedFrequencyKey = `${frequency.mode}:${frequency.count}`;
					}
					await update();
				};
			}}
		>
			<div class="frequency-options">
				<label class="frequency-option">
					<input
						type="radio"
						name="mode"
						value="few"
						checked={selectedFrequencyMode === 'few'}
						onchange={() => selectFrequencyMode('few')}
					/>
					<span class="frequency-label">
						<span class="frequency-name">Few</span>
						<span class="frequency-desc">2 fun facts</span>
					</span>
				</label>

				<label class="frequency-option">
					<input
						type="radio"
						name="mode"
						value="normal"
						checked={selectedFrequencyMode === 'normal'}
						onchange={() => selectFrequencyMode('normal')}
					/>
					<span class="frequency-label">
						<span class="frequency-name">Normal</span>
						<span class="frequency-desc">4 fun facts</span>
					</span>
				</label>

				<label class="frequency-option">
					<input
						type="radio"
						name="mode"
						value="many"
						checked={selectedFrequencyMode === 'many'}
						onchange={() => selectFrequencyMode('many')}
					/>
					<span class="frequency-label">
						<span class="frequency-name">Many</span>
						<span class="frequency-desc">8 fun facts</span>
					</span>
				</label>

				<label class="frequency-option">
					<input
						type="radio"
						name="mode"
						value="custom"
						checked={selectedFrequencyMode === 'custom'}
						onchange={() => selectFrequencyMode('custom')}
					/>
					<span class="frequency-label">
						<span class="frequency-name">Custom</span>
						<span class="frequency-desc">1-15 fun facts</span>
					</span>
				</label>
			</div>

			{#if selectedFrequencyMode === 'custom'}
				<div class="custom-count-input">
					<label for="customCount">Number of fun facts:</label>
					<input
						type="number"
						id="customCount"
						name="customCount"
						bind:value={customCount}
						min="1"
						max="15"
						required
					/>
					{#if customCount < 1 || customCount > 15}
						<span class="custom-count-error">Custom count must be between 1 and 15.</span>
					{/if}
				</div>
			{/if}

			<button
				type="submit"
				class="save-frequency-button"
				disabled={selectedFrequencyMode === 'custom' && (customCount < 1 || customCount > 15)}
			>
			Save Frequency Settings
		</button>
	</form>
	</section>
	</div>

	<!-- Custom Slide Editor Modal -->
	{#if showEditor}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-overlay" onclick={closeEditor} role="presentation">
			<div
				class="modal"
				onclick={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="editor-title"
				tabindex="-1"
				bind:this={editorModalRef}
			>
				<header class="modal-header">
					<h2 id="editor-title">
						{editingSlide ? 'Edit Custom Slide' : 'Create Custom Slide'}
					</h2>
					<Button
						type="button"
						class="close-button tap-target"
						onclick={closeEditor}
						aria-label="Close"
					>
						&times;
					</Button>
				</header>

				<form
					method="POST"
					action={editingSlide ? '?/updateCustom' : '?/createCustom'}
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								closeEditor();
							} else if (
								result.type === 'failure' &&
								typeof result.data?.error === 'string' &&
								result.data.error.toLowerCase().includes('unsafe html')
							) {
								editorTitle = '';
								editorContent = '';
							}
							await update();
						};
					}}
				>
					{#if editingSlide}
						<input type="hidden" name="id" value={editingSlide.id} />
					{/if}

					<div class="form-group">
						<label for="title">Title</label>
						<input
							type="text"
							id="title"
							name="title"
							bind:this={editorTitleInputRef}
							bind:value={editorTitle}
							required
							placeholder="Enter slide title"
							aria-invalid={slideFieldErrors?.title?.[0] ? 'true' : undefined}
							aria-describedby={slideFieldErrors?.title?.[0] ? 'title-error' : undefined}
						/>
						{#if slideFieldErrors?.title?.[0]}
							<span id="title-error" class="field-error" role="alert">
								{slideFieldErrors.title[0]}
							</span>
						{/if}
					</div>

					<div class="form-group">
						<label for="content">Content (Markdown)</label>
						<textarea
							id="content"
							name="content"
							bind:value={editorContent}
							required
							rows="10"
							placeholder="Write your slide content in Markdown..."
						></textarea>
					</div>

					<div class="form-row form-row-aligned">
						<div class="form-group form-group-year">
							<label for="year">Year</label>
							<select id="year" name="year" bind:value={editorYear} class="year-select">
								<option value={null}>All years</option>
								{#each data.availableYears as year}
									<option value={year}>{year}</option>
								{/each}
							</select>
							<span class="field-hint">Leave as "All years" to show on every wrapped</span>
						</div>

						<div class="form-group form-group-enabled">
							<label for="enabled-checkbox">Status</label>
							<label class="checkbox-toggle">
								<input
									type="checkbox"
									id="enabled-checkbox"
									name="enabled"
									bind:checked={editorEnabled}
									value="true"
								/>
								<span class="toggle-label">{editorEnabled ? 'Enabled' : 'Disabled'}</span>
							</label>
						</div>
					</div>

					<!-- Preview Section -->
					<div class="preview-section">
						<h3>Preview</h3>
						<button
							type="button"
							class="preview-button tap-target"
							onclick={async () => {
								// Short-circuit when there is nothing to render. Without this
								// guard the server returns html: '' for empty input and the
								// preview region falls through to {@html ''} — visible
								// outcome is the placeholder text staying put with no
								// indication the button was clicked (dogfood ISSUE-004).
								const content = editorContent ?? '';
								if (content.trim().length === 0) {
									previewHtml = '';
									previewRendered = false;
									previewError = 'Enter some Markdown content first.';
									return;
								}

								const formData = new FormData();
								formData.append('content', content);

								try {
									const result = await submitAction<{ html?: string }>(
										'?/previewMarkdown',
										formData
									);
									if (result.type === 'success') {
										const html = typeof result.data.html === 'string' ? result.data.html : '';
										previewHtml = html;
										// Render the preview region whenever the server returned
										// success, even if html is empty (e.g. sanitizer stripped
										// everything). An explicit empty-state line inside the
										// rendered region is clearer than silently reverting to
										// the "Click 'Update Preview' …" placeholder, which made
										// the button look broken.
										previewRendered = true;
										previewError = '';
									} else if (result.type === 'failure') {
										previewHtml = '';
										previewRendered = false;
										previewError = result.data.error ?? 'Failed to render Markdown';
									} else if (result.type === 'error') {
										previewHtml = '';
										previewRendered = false;
										previewError = result.error.message ?? 'Failed to render Markdown';
									}
								} catch (error) {
									console.error('Failed to render Markdown preview:', error);
									previewHtml = '';
									previewRendered = false;
									previewError = 'Failed to render Markdown';
								}
							}}
						>
							Update Preview
						</button>

						<div class="preview-content">
							{#if previewError}
								<p class="preview-error">{previewError}</p>
							{:else if previewRendered}
								{#if previewHtml.length > 0}
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html previewHtml}
								{:else}
									<p class="preview-placeholder">Markdown rendered to an empty result.</p>
								{/if}
							{:else}
								<p class="preview-placeholder">Click "Update Preview" to see rendered Markdown</p>
							{/if}
						</div>
					</div>

					<div class="modal-actions">
						<Button type="button" class="cancel-button tap-target" onclick={closeEditor}>
							Cancel
						</Button>
						<SubmitButton class="save-button tap-target">
							{#snippet children()}
								{editingSlide ? 'Save Changes' : 'Create Slide'}
							{/snippet}
						</SubmitButton>
					</div>
				</form>
			</div>
		</div>
	{/if}
</div>

<style>
	.admin-container {
			max-width: 800px;
			margin: 0 auto;
			padding: 2rem;
		}

		.field-error {
			display: block;
			font-size: 0.75rem;
			color: oklch(var(--destructive));
			margin-top: 0.375rem;
		}

		.admin-header {
			margin-bottom: 2rem;
		}

		.admin-header h1 {
			font-size: 2rem;
			font-weight: 700;
			color: oklch(var(--primary));
			margin: 0 0 0.5rem;
		}

		.subtitle {
			color: oklch(var(--muted-foreground));
			margin: 0;
		}

		.section {
			background: oklch(var(--card));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			padding: 1.5rem;
			margin-bottom: 2rem;
		}

		.section h2 {
			font-size: 1.25rem;
			font-weight: 600;
			color: oklch(var(--foreground));
			margin: 0 0 0.5rem;
		}

		.section-header {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
			gap: 1rem;
			margin-bottom: 1rem;
		}

		.section-title-content {
			min-width: 0;
		}

		.section-header h2 {
			margin: 0 0 0.25rem;
		}

		.section-header .section-description {
			margin: 0;
		}

		.section-description {
			color: oklch(var(--muted-foreground));
			font-size: 0.875rem;
			margin: 0 0 1rem;
		}

		.slide-list {
			list-style: none;
			padding: 0;
			margin: 0;
		}

		.slide-item {
			display: flex;
			align-items: center;
			gap: 1rem;
			padding: 0.75rem 1rem;
			background: oklch(var(--secondary));
			border-radius: var(--radius);
			margin-bottom: 0.5rem;
			cursor: grab;
			transition:
				background 0.15s ease,
				border-color 0.15s ease,
				box-shadow 0.15s ease;
			border-left: 3px solid transparent;
		}

		.slide-item:hover {
			background: oklch(var(--muted));
		}

		.slide-item.dragging {
			opacity: 0.5;
		}

		.slide-item.drag-over {
			border: 2px dashed oklch(var(--primary));
			border-left: 3px solid oklch(var(--primary));
		}

		/* Custom slide styling with distinct visual indicator */
		.slide-item.is-custom {
			border-left: 3px solid oklch(0.6192 0.2037 312.73);
			background: linear-gradient(90deg, oklch(0.6192 0.2037 312.73 / 0.08) 0%, oklch(var(--secondary)) 100%);
		}

		.slide-item.is-custom:hover {
			background: linear-gradient(90deg, oklch(0.6192 0.2037 312.73 / 0.12) 0%, oklch(var(--muted)) 100%);
		}

		.drag-handle {
			color: oklch(var(--muted-foreground));
			font-size: 1.25rem;
			cursor: grab;
			user-select: none;
			flex-shrink: 0;
		}

		.slide-name {
			flex: 1;
			font-weight: 500;
		}

		.slide-name-group {
			flex: 1;
			display: flex;
			align-items: center;
			gap: 0.5rem;
			flex-wrap: wrap;
		}

		.custom-badge {
			display: inline-flex;
			align-items: center;
			padding: 0.125rem 0.5rem;
			background: oklch(0.6192 0.2037 312.73 / 0.2);
			color: oklch(0.7546 0.1294 313.96);
			border-radius: 9999px;
			font-size: 0.625rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.05em;
		}

		.year-badge {
			display: inline-flex;
			align-items: center;
			padding: 0.125rem 0.375rem;
			background: oklch(var(--muted));
			color: oklch(var(--muted-foreground));
			border-radius: var(--radius);
			font-size: 0.625rem;
			font-weight: 500;
		}

		.slide-actions {
			display: flex;
			align-items: center;
			gap: 0.375rem;
		}

		/* `.action-button` is the per-row 28px-square icon-action CTA
		   (edit-action + delete-action variants). Hoisted to :global so
		   shadcn Button's child-rendered <button> inherits the muted-
		   default + primary-on-hover (edit) / destructive-on-hover
		   (delete) palette swaps. The `.delete-action` button stays
		   native this iteration (inside the confirm/cancel flow); the
		   shared rules below cover both consumers. */
		:global(.action-button) {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 28px;
			height: 28px;
			padding: 0;
			background: oklch(var(--muted));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			color: oklch(var(--muted-foreground));
			cursor: pointer;
			transition: all 0.15s ease;
		}

		:global(.action-button:hover) {
			background: oklch(var(--secondary));
			color: oklch(var(--foreground));
		}

		:global(.action-button.edit-action:hover) {
			background: oklch(var(--primary));
			color: oklch(var(--primary-foreground));
			border-color: oklch(var(--primary));
		}

		:global(.action-button.delete-action:hover) {
			background: oklch(var(--destructive));
			color: oklch(var(--destructive-foreground));
			border-color: oklch(var(--destructive));
		}

		.delete-form {
			display: contents;
		}

		.delete-trigger-form {
			display: contents;
		}

		.confirm-delete {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			flex-wrap: wrap;
		}

		.confirm-delete-text {
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
		}

		.confirm-delete-text strong {
			color: oklch(var(--foreground));
			font-weight: 600;
		}

		/* `.confirm-button` + `.cancel-delete-button` are the destructive-
		   confirmation pair inside each slide row's delete flow. Hoisted
		   to :global so SubmitButton (confirm) + shadcn Button (cancel)
		   inherit their respective palettes (destructive vs muted). */
		:global(.confirm-button) {
			padding: 0.25rem 0.5rem;
			background: oklch(var(--destructive));
			color: oklch(var(--destructive-foreground));
			border: none;
			border-radius: var(--radius);
			font-size: 0.75rem;
			font-weight: 500;
			cursor: pointer;
		}

		:global(.confirm-button:hover) {
			opacity: 0.9;
		}

		:global(.cancel-delete-button) {
			padding: 0.25rem 0.5rem;
			background: oklch(var(--muted));
			color: oklch(var(--muted-foreground));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			font-size: 0.75rem;
			cursor: pointer;
		}

		:global(.cancel-delete-button:hover) {
			background: oklch(var(--secondary));
		}

		.toggle-form {
			margin: 0;
		}

		/* `.toggle-button` is the per-row Enabled/Disabled toggle CTA
		   (used by both built-in slides + custom slides). Hoisted to
		   :global so SubmitButton's child-rendered <button> inherits
		   the muted-default vs primary-enabled palette swap. The
		   `.enabled` modifier toggles via template-literal class prop
		   (same pattern as admin/users iteration 108). */
		:global(.toggle-button) {
			padding: 0.375rem 0.75rem;
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			background: oklch(var(--muted));
			color: oklch(var(--muted-foreground));
			font-size: 0.75rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.15s ease;
		}

		:global(.toggle-button.enabled) {
			background: oklch(var(--primary));
			color: oklch(var(--primary-foreground));
			border-color: oklch(var(--primary));
		}

		:global(.toggle-button:hover) {
			opacity: 0.9;
		}

		/* `.add-button` is the section-header primary CTA ("Add Custom
		   Slide"). Hoisted to :global so shadcn Button's child-rendered
		   <button> inherits the primary palette + hover translate-y.
		   The `.add-button-icon` descendant rule (lucide Plus sizing)
		   stays — the previous hybrid scoped+global selector is fully
		   globalised now. */
		:global(.add-button) {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.5rem 1rem;
			background: oklch(var(--primary));
			color: oklch(var(--primary-foreground));
			border: none;
			border-radius: var(--radius);
			font-weight: 500;
			font-size: 0.875rem;
			cursor: pointer;
			transition: all 0.15s ease;
			white-space: nowrap;
			flex-shrink: 0;
		}

		:global(.add-button:hover) {
			opacity: 0.9;
			transform: translateY(-1px);
		}

		:global(.add-button .add-button-icon) {
			width: 1rem;
			height: 1rem;
			flex-shrink: 0;
		}

		.empty-message {
			color: oklch(var(--muted-foreground));
			text-align: center;
			padding: 2rem;
		}

		/* Modal Styles */
		.modal-overlay {
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.75);
			display: flex;
			align-items: center;
			justify-content: center;
			z-index: 100;
			padding: 1rem;
		}

		.modal {
			background: oklch(var(--card));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			width: 100%;
			max-width: 600px;
			max-height: 90vh;
			overflow-y: auto;
		}

		.modal-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 1rem 1.5rem;
			border-bottom: 1px solid oklch(var(--border));
		}

		.modal-header h2 {
			font-size: 1.25rem;
			font-weight: 600;
			margin: 0;
		}

		/* `.close-button` is the modal-header X dismiss CTA. Hoisted to
		   :global so shadcn Button's child-rendered <button> inherits
		   the transparent background + large × glyph treatment. */
		:global(.close-button) {
			background: none;
			border: none;
			font-size: 1.5rem;
			color: oklch(var(--muted-foreground));
			cursor: pointer;
			padding: 0;
			line-height: 1;
		}

		:global(.close-button:hover) {
			color: oklch(var(--foreground));
		}

		.modal form {
			padding: 1.5rem;
		}

		.form-group {
			margin-bottom: 1rem;
		}

		.form-group label {
			display: block;
			font-size: 0.875rem;
			font-weight: 500;
			margin-bottom: 0.375rem;
			color: oklch(var(--foreground));
		}

		.form-group input[type='text'],
		.form-group textarea {
			width: 100%;
			padding: 0.5rem 0.75rem;
			background: oklch(var(--input));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			color: oklch(var(--foreground));
			font-size: 0.875rem;
			font-family: inherit;
		}

		.form-group input:focus,
		.form-group textarea:focus {
			outline: none;
			border-color: oklch(var(--ring));
			box-shadow: 0 0 0 2px oklch(var(--ring) / 0.2);
		}

		.form-group textarea {
			resize: vertical;
			min-height: 96px;
			font-family: monospace;
		}

		.form-row {
			display: flex;
			gap: 1rem;
		}

		.form-row .form-group {
			flex: 1;
		}

		.form-row-aligned {
			align-items: flex-start;
		}

		.form-group-year {
			flex: 2;
		}

		.form-group-enabled {
			flex: 1;
			min-width: 120px;
		}

		.year-select {
			width: 100%;
			padding: 0.5rem 0.75rem;
			background: oklch(var(--input));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			color: oklch(var(--foreground));
			font-size: 0.875rem;
			font-family: inherit;
			cursor: pointer;
		}

		.year-select:focus {
			outline: none;
			border-color: oklch(var(--ring));
			box-shadow: 0 0 0 2px oklch(var(--ring) / 0.2);
		}

		.field-hint {
			display: block;
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
			margin-top: 0.375rem;
		}

		.checkbox-toggle {
			display: flex;
			align-items: center;
			gap: 0.625rem;
			cursor: pointer;
			padding: 0.5rem 0.75rem;
			background: oklch(var(--input));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			transition: all 0.15s ease;
		}

		.checkbox-toggle:hover {
			background: oklch(var(--muted));
		}

		.checkbox-toggle:has(input:checked) {
			background: oklch(var(--primary) / 0.15);
			border-color: oklch(var(--primary) / 0.5);
		}

		.checkbox-toggle input {
			width: 1rem;
			height: 1rem;
			accent-color: oklch(var(--primary));
			margin: 0;
		}

		.toggle-label {
			font-size: 0.875rem;
			font-weight: 500;
			color: oklch(var(--foreground));
		}

		.preview-section {
			margin-top: 1.5rem;
			padding-top: 1rem;
			border-top: 1px solid oklch(var(--border));
		}

		.preview-section h3 {
			font-size: 0.875rem;
			font-weight: 600;
			margin: 0 0 0.75rem;
		}

		.preview-button {
			padding: 0.375rem 0.75rem;
			background: oklch(var(--secondary));
			color: oklch(var(--foreground));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			font-size: 0.75rem;
			cursor: pointer;
			margin-bottom: 0.75rem;
		}

		.preview-button:hover {
			background: oklch(var(--muted));
		}

		.preview-content {
			background: oklch(var(--background));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			padding: 1rem;
			min-height: 100px;
			max-height: 200px;
			overflow-y: auto;
			font-size: 0.875rem;
			line-height: 1.6;
			overflow-wrap: anywhere;
			word-break: break-word;
		}

		.preview-placeholder {
			color: oklch(var(--muted-foreground));
			font-style: italic;
			margin: 0;
		}

		.modal-actions {
			display: flex;
			justify-content: flex-end;
			gap: 0.75rem;
			margin-top: 1.5rem;
			padding-top: 0.75rem;
			padding-bottom: 0.25rem;
			border-top: 1px solid oklch(var(--border));
			position: sticky;
			bottom: 0;
			background: oklch(var(--card));
			z-index: 1;
		}

		/* `.cancel-button` + `.save-button` are the editor modal's footer
		   action pair. Hoisted to :global so shadcn Button (cancel) +
		   SubmitButton (save) inherit their secondary/primary palettes. */
		:global(.cancel-button) {
			padding: 0.5rem 1rem;
			background: oklch(var(--secondary));
			color: oklch(var(--foreground));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			cursor: pointer;
		}

		:global(.cancel-button:hover) {
			background: oklch(var(--muted));
		}

		:global(.save-button) {
			padding: 0.5rem 1rem;
			background: oklch(var(--primary));
			color: oklch(var(--primary-foreground));
			border: none;
			border-radius: var(--radius);
			font-weight: 500;
			cursor: pointer;
			position: relative;
			z-index: 2;
		}

		:global(.save-button:hover) {
			opacity: 0.9;
		}

		/* Markdown preview styling */
		.preview-content :global(h1),
		.preview-content :global(h2),
		.preview-content :global(h3) {
			color: oklch(var(--primary));
			margin-top: 1rem;
			margin-bottom: 0.5rem;
		}

		.preview-content :global(h1) {
			font-size: 1.5rem;
		}

		.preview-content :global(h2) {
			font-size: 1.25rem;
		}

		.preview-content :global(h3) {
			font-size: 1.125rem;
		}

		.preview-content :global(p) {
			margin-bottom: 0.75rem;
		}

		.preview-content :global(ul),
		.preview-content :global(ol) {
			margin-bottom: 0.75rem;
			padding-left: 1.5rem;
		}

		.preview-content :global(strong) {
			color: oklch(var(--primary));
			font-weight: 700;
		}

		.preview-content :global(code) {
			background: oklch(var(--muted));
			padding: 0.125rem 0.25rem;
			border-radius: 0.25rem;
			font-family: monospace;
			font-size: 0.85em;
		}

		.preview-content :global(blockquote) {
			border-left: 3px solid oklch(var(--primary));
			padding-left: 1rem;
			margin: 0.75rem 0;
			color: oklch(var(--muted-foreground));
			font-style: italic;
		}

		/* Fun Fact Frequency Styles */
		.frequency-options {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
			gap: 0.75rem;
			margin-bottom: 1rem;
		}

		.frequency-option {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			padding: 0.75rem 1rem;
			background: oklch(var(--secondary));
			border-radius: var(--radius);
			cursor: pointer;
			transition: background 0.15s ease;
		}

		.frequency-option:hover {
			background: oklch(var(--muted));
		}

		.frequency-option:has(input:checked) {
			background: oklch(var(--primary) / 0.15);
			outline: 2px solid oklch(var(--primary));
		}

		.frequency-option input[type='radio'] {
			width: 1rem;
			height: 1rem;
			accent-color: oklch(var(--primary));
			margin: 0;
		}

		.frequency-label {
			display: flex;
			flex-direction: column;
			gap: 0.125rem;
		}

		.frequency-name {
			font-weight: 600;
			font-size: 0.875rem;
			color: oklch(var(--foreground));
		}

		.frequency-desc {
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
		}

		.custom-count-input {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			margin-bottom: 1rem;
			padding: 0.75rem 1rem;
			background: oklch(var(--secondary));
			border-radius: var(--radius);
		}

		.custom-count-input label {
			font-size: 0.875rem;
			font-weight: 500;
			color: oklch(var(--foreground));
		}

		.custom-count-input input[type='number'] {
			width: 80px;
			padding: 0.375rem 0.5rem;
			background: oklch(var(--input));
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			color: oklch(var(--foreground));
			font-size: 0.875rem;
		}

		.custom-count-input input[type='number']:focus {
			outline: none;
			border-color: oklch(var(--ring));
			box-shadow: 0 0 0 2px oklch(var(--ring) / 0.2);
		}

		.custom-count-error {
			font-size: 0.75rem;
			color: oklch(var(--destructive));
		}

		.save-frequency-button:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.save-frequency-button {
			padding: 0.5rem 1rem;
			background: oklch(var(--primary));
			color: oklch(var(--primary-foreground));
			border: none;
			border-radius: var(--radius);
			font-weight: 500;
			cursor: pointer;
			transition: opacity 0.15s ease;
		}

		.save-frequency-button:hover {
			opacity: 0.9;
		}

		@media (max-width: 430px) {
			.section-header {
				flex-direction: column;
				align-items: stretch;
			}

			:global(.add-button) {
				width: 100%;
				justify-content: center;
			}
		}
</style>
