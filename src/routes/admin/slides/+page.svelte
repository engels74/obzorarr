<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData, ActionData } from './$types';
	import type { SlideType } from '$lib/components/slides/types';
	import { DEFAULT_SLIDE_ORDER } from '$lib/components/slides/types';

	/**
	 * Admin Slides Page
	 *
	 * Manages slide configuration (enable/disable, reordering)
	 * and custom slides (create, edit, delete with Markdown).
	 *
	 * Implements Requirements:
	 * - 9.1: Admin can create custom slides with Markdown editor
	 * - 9.4: Admin can reorder slides
	 * - 9.5: Admin can toggle slides off
	 * - 11.3: Slide configuration with toggle, reorder, preview
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();

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
		'fun-fact': 'Fun Fact',
		custom: 'Custom Slide'
	};

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

	// Derived sorted configs
	const sortedConfigs = $derived(
		[...data.configs].sort((a, b) => a.sortOrder - b.sortOrder)
	);

	// Get configs for built-in slides only (not custom)
	const builtInConfigs = $derived(
		sortedConfigs.filter((c) => DEFAULT_SLIDE_ORDER.includes(c.slideType as SlideType))
	);

	// Open editor for new slide
	function openNewEditor() {
		editingSlide = null;
		editorTitle = '';
		editorContent = '';
		editorYear = new Date().getFullYear();
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

	// Handle drop - reorder slides
	function handleDrop(event: DragEvent, dropIndex: number) {
		event.preventDefault();
		if (draggedIndex === null || draggedIndex === dropIndex) return;

		const newOrder = [...builtInConfigs.map((c) => c.slideType)];
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
</script>

<div class="admin-container">
	<header class="admin-header">
		<h1>Slide Configuration</h1>
		<p class="subtitle">Manage slides for Year in Review presentations</p>
	</header>

	{#if form?.error}
		<div class="error-banner" role="alert">
			{form.error}
		</div>
	{/if}

	{#if form?.success}
		<div class="success-banner" role="status">
			Operation completed successfully
		</div>
	{/if}

	<!-- Slide Order Section -->
	<section class="section">
		<h2>Slide Order</h2>
		<p class="section-description">
			Drag and drop to reorder. Toggle to enable or disable slides.
		</p>

		<!-- Hidden form for reordering -->
		<form id="reorder-form" method="POST" action="?/reorder" use:enhance>
			<input type="hidden" name="order" value="" />
		</form>

		<ul class="slide-list" role="list">
			{#each builtInConfigs as config, index (config.slideType)}
				<li
					class="slide-item"
					class:dragging={draggedIndex === index}
					class:drag-over={dragOverIndex === index}
					draggable="true"
					ondragstart={() => handleDragStart(index)}
					ondragover={(e) => handleDragOver(e, index)}
					ondragend={handleDragEnd}
					ondrop={(e) => handleDrop(e, index)}
					role="listitem"
				>
					<span class="drag-handle" aria-hidden="true">⋮⋮</span>

					<span class="slide-name">
						{SLIDE_NAMES[config.slideType as SlideType] ?? config.slideType}
					</span>

					<form method="POST" action="?/toggleSlide" use:enhance class="toggle-form">
						<input type="hidden" name="slideType" value={config.slideType} />
						<button
							type="submit"
							class="toggle-button"
							class:enabled={config.enabled}
							aria-label={config.enabled ? 'Disable slide' : 'Enable slide'}
						>
							{config.enabled ? 'Enabled' : 'Disabled'}
						</button>
					</form>
				</li>
			{/each}
		</ul>
	</section>

	<!-- Custom Slides Section -->
	<section class="section">
		<div class="section-header">
			<h2>Custom Slides</h2>
			<button type="button" class="add-button" onclick={openNewEditor}>
				+ Add Custom Slide
			</button>
		</div>
		<p class="section-description">
			Create custom slides with Markdown content.
		</p>

		{#if data.customSlides.length === 0}
			<p class="empty-message">No custom slides yet. Create one to get started.</p>
		{:else}
			<ul class="custom-slide-list" role="list">
				{#each data.customSlides as slide (slide.id)}
					<li class="custom-slide-item" role="listitem">
						<div class="custom-slide-info">
							<h3 class="custom-slide-title">{slide.title}</h3>
							<span class="custom-slide-meta">
								{#if slide.year}Year: {slide.year}{/if}
								<span class="status-badge" class:enabled={slide.enabled}>
									{slide.enabled ? 'Enabled' : 'Disabled'}
								</span>
							</span>
						</div>

						<div class="custom-slide-actions">
							<button
								type="button"
								class="edit-button"
								onclick={() => openEditEditor(slide)}
							>
								Edit
							</button>

							<form method="POST" action="?/deleteCustom" use:enhance>
								<input type="hidden" name="id" value={slide.id} />
								<button
									type="submit"
									class="delete-button"
									onclick={(e) => {
										if (!confirm('Delete this custom slide?')) {
											e.preventDefault();
										}
									}}
								>
									Delete
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
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
					<button
						type="button"
						class="close-button"
						onclick={closeEditor}
						aria-label="Close"
					>
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

					<div class="form-row">
						<div class="form-group">
							<label for="year">Year (optional)</label>
							<input
								type="number"
								id="year"
								name="year"
								bind:value={editorYear}
								min="2000"
								max="2100"
								placeholder="e.g. 2024"
							/>
						</div>

						<div class="form-group">
							<label class="checkbox-label">
								<input
									type="checkbox"
									name="enabled"
									bind:checked={editorEnabled}
									value="true"
								/>
								Enabled
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
								const result = await response.json();
								if (result.type === 'success' && result.data?.html) {
									previewHtml = result.data.html;
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
								<p class="preview-placeholder">
									Click "Update Preview" to see rendered Markdown
								</p>
							{/if}
						</div>
					</div>

					<div class="modal-actions">
						<button type="button" class="cancel-button" onclick={closeEditor}>
							Cancel
						</button>
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

	.error-banner {
		background: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
		padding: 1rem;
		border-radius: var(--radius);
		margin-bottom: 1.5rem;
	}

	.success-banner {
		background: hsl(120 40% 30%);
		color: white;
		padding: 1rem;
		border-radius: var(--radius);
		margin-bottom: 1.5rem;
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
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.section-header h2 {
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
		transition: background 0.15s ease;
	}

	.slide-item:hover {
		background: hsl(var(--muted));
	}

	.slide-item.dragging {
		opacity: 0.5;
	}

	.slide-item.drag-over {
		border: 2px dashed hsl(var(--primary));
	}

	.drag-handle {
		color: hsl(var(--muted-foreground));
		font-size: 1.25rem;
		cursor: grab;
		user-select: none;
	}

	.slide-name {
		flex: 1;
		font-weight: 500;
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
		padding: 0.5rem 1rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border: none;
		border-radius: var(--radius);
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}

	.add-button:hover {
		opacity: 0.9;
	}

	.empty-message {
		color: hsl(var(--muted-foreground));
		text-align: center;
		padding: 2rem;
	}

	.custom-slide-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.custom-slide-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: hsl(var(--secondary));
		border-radius: var(--radius);
		margin-bottom: 0.5rem;
	}

	.custom-slide-info {
		flex: 1;
	}

	.custom-slide-title {
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 0.25rem;
	}

	.custom-slide-meta {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.status-badge {
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		background: hsl(var(--muted));
		font-size: 0.625rem;
		text-transform: uppercase;
		font-weight: 600;
	}

	.status-badge.enabled {
		background: hsl(var(--primary) / 0.2);
		color: hsl(var(--primary));
	}

	.custom-slide-actions {
		display: flex;
		gap: 0.5rem;
	}

	.edit-button,
	.delete-button {
		padding: 0.375rem 0.75rem;
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.edit-button:hover {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.delete-button:hover {
		background: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
		border-color: hsl(var(--destructive));
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
	.form-group input[type='number'],
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

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
		padding-top: 1.5rem;
	}

	.checkbox-label input {
		width: 1rem;
		height: 1rem;
		accent-color: hsl(var(--primary));
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
</style>
