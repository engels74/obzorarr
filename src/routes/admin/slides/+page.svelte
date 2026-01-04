<script lang="ts">
	import type { ActionResult } from '@sveltejs/kit';
	import { deserialize, enhance } from '$app/forms';
	import type { SlideType } from '$lib/components/slides/types';
	import { DEFAULT_SLIDE_ORDER } from '$lib/components/slides/types';
	import { handleFormToast } from '$lib/utils/form-toast';
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

	// Slide display names
	const SLIDE_NAMES: Record<SlideType, string> = {
		'total-time': 'Total Watch Time',
		'top-movies': 'Top Movies',
		'top-shows': 'Top Shows',
		genres: 'Genre Breakdown',
		distribution: 'Viewing Distribution',
		percentile: 'Percentile Ranking',
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

	// Fun Fact frequency state (synced from server data)
	let selectedFrequencyMode = $state<typeof data.funFactFrequency.mode>('normal');
	let customCount = $state(0);

	// Sync state from data before DOM updates
	$effect.pre(() => {
		selectedFrequencyMode = data.funFactFrequency.mode;
		customCount = data.funFactFrequency.count;
	});

	// State for custom slide editor
	let showEditor = $state(false);
	let editingSlide = $state<(typeof data.customSlides)[0] | null>(null);
	let editorTitle = $state('');
	let editorContent = $state('');
	let editorYear = $state<number | null>(null);
	let editorEnabled = $state(true);
	let previewHtml = $state('');

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
		editingSlide = null;
		editorTitle = '';
		editorContent = '';
		editorYear = null; // Default to "All years"
		editorEnabled = true;
		previewHtml = '';
		showEditor = true;
	}

	// Open editor for existing slide
	function openEditEditor(slide: (typeof data.customSlides)[0]) {
		editingSlide = slide;
		editorTitle = slide.title;
		editorContent = slide.content;
		editorYear = slide.year;
		editorEnabled = slide.enabled;
		previewHtml = slide.renderedHtml ?? '';
		showEditor = true;
	}

	// Close editor
	function closeEditor() {
		showEditor = false;
		editingSlide = null;
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
	<header class="admin-header">
		<h1>Slide Configuration</h1>
		<p class="subtitle">Manage slides for Year in Review presentations</p>
	</header>

	<!-- Slide Order Section -->
	<section class="section">
		<div class="section-header">
			<div>
				<h2>Slide Order</h2>
				<p class="section-description">
					Drag and drop to reorder. Toggle to enable or disable slides.
				</p>
			</div>
			<button type="button" class="add-button" onclick={openNewEditor}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M12 5v14M5 12h14" />
				</svg>
				Add Custom Slide
			</button>
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
							<button
								type="submit"
								class="toggle-button"
								class:enabled={item.enabled}
								aria-label={item.enabled ? 'Disable slide' : 'Enable slide'}
							>
								{item.enabled ? 'Enabled' : 'Disabled'}
							</button>
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
							<button
								type="button"
								class="action-button edit-action"
								onclick={() => {
									const slide = getCustomSlideForEdit(item);
									if (slide) openEditEditor(slide);
								}}
								aria-label="Edit custom slide"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
									<path d="m15 5 4 4" />
								</svg>
							</button>

							<form method="POST" action="?/toggleCustomSlide" use:enhance class="toggle-form">
								<input type="hidden" name="id" value={item.id} />
								<button
									type="submit"
									class="toggle-button"
									class:enabled={item.enabled}
									aria-label={item.enabled ? 'Disable slide' : 'Enable slide'}
								>
									{item.enabled ? 'Enabled' : 'Disabled'}
								</button>
							</form>

							<form method="POST" action="?/deleteCustom" use:enhance class="delete-form">
								<input type="hidden" name="id" value={item.id} />
								<button
									type="submit"
									class="action-button delete-action"
									onclick={(e) => {
										if (!confirm('Delete this custom slide?')) {
											e.preventDefault();
										}
									}}
									aria-label="Delete custom slide"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M3 6h18" />
										<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
										<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
									</svg>
								</button>
							</form>
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

		<form method="POST" action="?/setFunFactFrequency" use:enhance>
			<div class="frequency-options">
				<label class="frequency-option">
					<input type="radio" name="mode" value="few" bind:group={selectedFrequencyMode} />
					<span class="frequency-label">
						<span class="frequency-name">Few</span>
						<span class="frequency-desc">1-2 fun facts</span>
					</span>
				</label>

				<label class="frequency-option">
					<input type="radio" name="mode" value="normal" bind:group={selectedFrequencyMode} />
					<span class="frequency-label">
						<span class="frequency-name">Normal</span>
						<span class="frequency-desc">3-5 fun facts</span>
					</span>
				</label>

				<label class="frequency-option">
					<input type="radio" name="mode" value="many" bind:group={selectedFrequencyMode} />
					<span class="frequency-label">
						<span class="frequency-name">Many</span>
						<span class="frequency-desc">6-10 fun facts</span>
					</span>
				</label>

				<label class="frequency-option">
					<input type="radio" name="mode" value="custom" bind:group={selectedFrequencyMode} />
					<span class="frequency-label">
						<span class="frequency-name">Custom</span>
						<span class="frequency-desc">Specific number</span>
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
				</div>
			{/if}

			<button type="submit" class="save-frequency-button"> Save Frequency Settings </button>
		</form>
	</section>

	<!-- Custom Slide Editor Modal -->
	{#if showEditor}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="modal-overlay" onclick={closeEditor} role="presentation">
			<div
				class="modal"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.key === 'Escape' && closeEditor()}
				role="dialog"
				aria-labelledby="editor-title"
				tabindex="-1"
			>
				<header class="modal-header">
					<h2 id="editor-title">
						{editingSlide ? 'Edit Custom Slide' : 'Create Custom Slide'}
					</h2>
					<button type="button" class="close-button" onclick={closeEditor} aria-label="Close">
						&times;
					</button>
				</header>

				<form
					method="POST"
					action={editingSlide ? '?/updateCustom' : '?/createCustom'}
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								closeEditor();
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
							bind:value={editorTitle}
							required
							placeholder="Enter slide title"
						/>
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
							class="preview-button"
							onclick={async () => {
								const formData = new FormData();
								formData.append('content', editorContent);
								const response = await fetch('?/previewMarkdown', {
									method: 'POST',
									body: formData
								});
								const result: ActionResult = deserialize(await response.text());
								if (result.type === 'success' && result.data?.html) {
									previewHtml = result.data.html as string;
								}
							}}
						>
							Update Preview
						</button>

						<div class="preview-content">
							{#if previewHtml}
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html previewHtml}
							{:else}
								<p class="preview-placeholder">Click "Update Preview" to see rendered Markdown</p>
							{/if}
						</div>
					</div>

					<div class="modal-actions">
						<button type="button" class="cancel-button" onclick={closeEditor}> Cancel </button>
						<button type="submit" class="save-button">
							{editingSlide ? 'Save Changes' : 'Create Slide'}
						</button>
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

	.admin-header {
		margin-bottom: 2rem;
	}

	.admin-header h1 {
		font-size: 2rem;
		font-weight: 700;
		color: hsl(var(--primary));
		margin: 0 0 0.5rem;
	}

	.subtitle {
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.section {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		padding: 1.5rem;
		margin-bottom: 2rem;
	}

	.section h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 0.5rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.section-header h2 {
		margin: 0 0 0.25rem;
	}

	.section-header .section-description {
		margin: 0;
	}

	.section-description {
		color: hsl(var(--muted-foreground));
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
		background: hsl(var(--secondary));
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
		background: hsl(var(--muted));
	}

	.slide-item.dragging {
		opacity: 0.5;
	}

	.slide-item.drag-over {
		border: 2px dashed hsl(var(--primary));
		border-left: 3px solid hsl(var(--primary));
	}

	/* Custom slide styling with distinct visual indicator */
	.slide-item.is-custom {
		border-left: 3px solid hsl(280 65% 60%);
		background: linear-gradient(90deg, hsl(280 65% 60% / 0.08) 0%, hsl(var(--secondary)) 100%);
	}

	.slide-item.is-custom:hover {
		background: linear-gradient(90deg, hsl(280 65% 60% / 0.12) 0%, hsl(var(--muted)) 100%);
	}

	.drag-handle {
		color: hsl(var(--muted-foreground));
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
		background: hsl(280 65% 60% / 0.2);
		color: hsl(280 65% 75%);
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
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
		border-radius: var(--radius);
		font-size: 0.625rem;
		font-weight: 500;
	}

	.slide-actions {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.action-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.action-button:hover {
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
	}

	.action-button.edit-action:hover {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.action-button.delete-action:hover {
		background: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
		border-color: hsl(var(--destructive));
	}

	.delete-form {
		display: contents;
	}

	.toggle-form {
		margin: 0;
	}

	.toggle-button {
		padding: 0.375rem 0.75rem;
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.toggle-button.enabled {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.toggle-button:hover {
		opacity: 0.9;
	}

	.add-button {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: var(--radius);
		font-weight: 500;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.add-button:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	.add-button svg {
		flex-shrink: 0;
	}

	.empty-message {
		color: hsl(var(--muted-foreground));
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
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
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
		border-bottom: 1px solid hsl(var(--border));
	}

	.modal-header h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.close-button {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 0;
		line-height: 1;
	}

	.close-button:hover {
		color: hsl(var(--foreground));
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
		color: hsl(var(--foreground));
	}

	.form-group input[type='text'],
	.form-group textarea {
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		font-family: inherit;
	}

	.form-group input:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: hsl(var(--ring));
		box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
	}

	.form-group textarea {
		resize: vertical;
		min-height: 150px;
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
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		font-family: inherit;
		cursor: pointer;
	}

	.year-select:focus {
		outline: none;
		border-color: hsl(var(--ring));
		box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
	}

	.field-hint {
		display: block;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-top: 0.375rem;
	}

	.checkbox-toggle {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		cursor: pointer;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		transition: all 0.15s ease;
	}

	.checkbox-toggle:hover {
		background: hsl(var(--muted));
	}

	.checkbox-toggle:has(input:checked) {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary) / 0.5);
	}

	.checkbox-toggle input {
		width: 1rem;
		height: 1rem;
		accent-color: hsl(var(--primary));
		margin: 0;
	}

	.toggle-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.preview-section {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid hsl(var(--border));
	}

	.preview-section h3 {
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0 0 0.75rem;
	}

	.preview-button {
		padding: 0.375rem 0.75rem;
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.75rem;
		cursor: pointer;
		margin-bottom: 0.75rem;
	}

	.preview-button:hover {
		background: hsl(var(--muted));
	}

	.preview-content {
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		padding: 1rem;
		min-height: 100px;
		font-size: 0.875rem;
		line-height: 1.6;
	}

	.preview-placeholder {
		color: hsl(var(--muted-foreground));
		font-style: italic;
		margin: 0;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid hsl(var(--border));
	}

	.cancel-button {
		padding: 0.5rem 1rem;
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		cursor: pointer;
	}

	.cancel-button:hover {
		background: hsl(var(--muted));
	}

	.save-button {
		padding: 0.5rem 1rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: var(--radius);
		font-weight: 500;
		cursor: pointer;
	}

	.save-button:hover {
		opacity: 0.9;
	}

	/* Markdown preview styling */
	.preview-content :global(h1),
	.preview-content :global(h2),
	.preview-content :global(h3) {
		color: hsl(var(--primary));
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
		color: hsl(var(--primary));
		font-weight: 700;
	}

	.preview-content :global(code) {
		background: hsl(var(--muted));
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 0.85em;
	}

	.preview-content :global(blockquote) {
		border-left: 3px solid hsl(var(--primary));
		padding-left: 1rem;
		margin: 0.75rem 0;
		color: hsl(var(--muted-foreground));
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
		background: hsl(var(--secondary));
		border-radius: var(--radius);
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.frequency-option:hover {
		background: hsl(var(--muted));
	}

	.frequency-option:has(input:checked) {
		background: hsl(var(--primary) / 0.15);
		outline: 2px solid hsl(var(--primary));
	}

	.frequency-option input[type='radio'] {
		width: 1rem;
		height: 1rem;
		accent-color: hsl(var(--primary));
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
		color: hsl(var(--foreground));
	}

	.frequency-desc {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.custom-count-input {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--secondary));
		border-radius: var(--radius);
	}

	.custom-count-input label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.custom-count-input input[type='number'] {
		width: 80px;
		padding: 0.375rem 0.5rem;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
	}

	.custom-count-input input[type='number']:focus {
		outline: none;
		border-color: hsl(var(--ring));
		box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
	}

	.save-frequency-button {
		padding: 0.5rem 1rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: var(--radius);
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}

	.save-frequency-button:hover {
		opacity: 0.9;
	}
</style>
