<script lang="ts">
	/**
	 * ProgressBar Component
	 *
	 * Displays progress through the story mode slides.
	 * Uses segmented bars with animation.
	 *
	 * Implements Requirement 5.5: Progress indicator showing current position
	 *
	 * @module components/wrapped/ProgressBar
	 */

	interface Props {
		/** Current slide index (0-based) */
		current: number;
		/** Total number of slides */
		total: number;
		/** Additional CSS classes */
		class?: string;
	}

	let { current, total, class: klass = '' }: Props = $props();

	// Calculate progress percentage for continuous bar fallback
	const progressPercent = $derived(total > 0 ? ((current + 1) / total) * 100 : 0);
</script>

<div
	class="progress-bar {klass}"
	role="progressbar"
	aria-valuenow={current + 1}
	aria-valuemin={1}
	aria-valuemax={total}
>
	<div class="segments">
		{#each Array(total) as _, index}
			<div
				class="segment"
				class:completed={index < current}
				class:active={index === current}
				class:pending={index > current}
			></div>
		{/each}
	</div>
	<span class="sr-only">{current + 1} of {total} slides</span>
</div>

<style>
	.progress-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 100;
		padding: 0.5rem 1rem;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.5), transparent);
	}

	.segments {
		display: flex;
		gap: 0.25rem;
		height: 3px;
	}

	.segment {
		flex: 1;
		border-radius: 1.5px;
		transition:
			background-color 0.3s ease,
			opacity 0.3s ease;
	}

	.segment.completed {
		background-color: var(--primary, #dc2626);
		opacity: 1;
	}

	.segment.active {
		background-color: var(--primary, #dc2626);
		opacity: 1;
		animation: pulse 2s ease-in-out infinite;
	}

	.segment.pending {
		background-color: var(--muted, rgba(255, 255, 255, 0.3));
		opacity: 0.5;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.7;
		}
	}

	.sr-only {
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

	@media (max-width: 768px) {
		.progress-bar {
			padding: 0.375rem 0.75rem;
		}

		.segments {
			height: 2px;
			gap: 0.125rem;
		}
	}
</style>
