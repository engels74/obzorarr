<script lang="ts">
	/**
	 * ModeToggle Component
	 *
	 * Toggle button for switching between Story Mode and Scroll Mode.
	 * Displays the target mode name and icon.
	 *
	 * Implements Requirements:
	 * - 6.3: Mode toggle between viewing modes
	 * - 6.4: Preserve position when switching modes (via callback)
	 *
	 * @module components/wrapped/ModeToggle
	 */

	type ViewMode = 'story' | 'scroll';

	interface Props {
		/** Current view mode */
		mode: ViewMode;
		/** Callback when mode changes */
		onModeChange: (newMode: ViewMode) => void;
		/** Additional CSS classes */
		class?: string;
	}

	let { mode, onModeChange, class: klass = '' }: Props = $props();

	// ==========================================================================
	// Derived Values
	// ==========================================================================

	/** Target mode when toggled */
	const targetMode = $derived<ViewMode>(mode === 'story' ? 'scroll' : 'story');

	/** Label for accessibility and tooltip */
	const label = $derived(mode === 'story' ? 'Switch to Scroll Mode' : 'Switch to Story Mode');

	/** Display text (shows target mode name) */
	const displayText = $derived(mode === 'story' ? 'Scroll' : 'Story');

	// ==========================================================================
	// Event Handlers
	// ==========================================================================

	function handleClick(): void {
		onModeChange(targetMode);
	}

	function handleKeyDown(event: KeyboardEvent): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			handleClick();
		}
	}
</script>

<button
	type="button"
	class="mode-toggle {klass}"
	onclick={handleClick}
	onkeydown={handleKeyDown}
	aria-label={label}
	title={label}
>
	{#if mode === 'story'}
		<!-- Scroll icon (arrows up/down) - indicates switching to scroll mode -->
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M12 3v18" />
			<path d="M8 7l4-4 4 4" />
			<path d="M8 17l4 4 4-4" />
		</svg>
	{:else}
		<!-- Slides icon (stacked rectangles) - indicates switching to story mode -->
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<path d="M8 4v16" />
			<path d="M16 4v16" />
		</svg>
	{/if}
	<span class="toggle-label">{displayText}</span>
</button>

<style>
	.mode-toggle {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 2rem;
		color: var(--foreground, white);
		cursor: pointer;
		font-family: inherit;
		transition:
			background-color 0.2s,
			transform 0.2s,
			border-color 0.2s;
	}

	.mode-toggle:hover {
		background: rgba(0, 0, 0, 0.9);
		border-color: rgba(255, 255, 255, 0.2);
		transform: scale(1.05);
	}

	.mode-toggle:focus-visible {
		outline: 2px solid var(--primary, #dc2626);
		outline-offset: 2px;
	}

	.mode-toggle:active {
		transform: scale(0.98);
	}

	.mode-toggle svg {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
	}

	.toggle-label {
		font-size: 0.875rem;
		font-weight: 500;
		white-space: nowrap;
	}

	/* Mobile: Hide label, show icon only */
	@media (max-width: 768px) {
		.mode-toggle {
			padding: 0.5rem;
			border-radius: 50%;
		}

		.toggle-label {
			/* Screen reader only on mobile */
			position: absolute;
			width: 1px;
			height: 1px;
			padding: 0;
			margin: -1px;
			overflow: hidden;
			clip: rect(0, 0, 0, 0);
			white-space: nowrap;
			border: 0;
		}
	}

	/* Reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.mode-toggle {
			transition: none;
		}

		.mode-toggle:hover,
		.mode-toggle:active {
			transform: none;
		}
	}
</style>
