<script lang="ts">
	import { animate } from 'motion';
	import { prefersReducedMotion } from 'svelte/motion';
	import BaseSlide from './BaseSlide.svelte';
	import type { FunFactSlideProps } from './types';

	/**
	 * FunFactSlide Component
	 *
	 * Displays a fun fact or comparison about the user's viewing habits.
	 *
	 * Implements Requirement 5.6 (Motion One animations with $effect cleanup)
	 */

	interface Props extends FunFactSlideProps {}

	let {
		fact,
		comparison,
		icon = '🎬',
		active = true,
		onAnimationComplete,
		class: klass = '',
		children
	}: Props = $props();

	// Element references
	let container: HTMLElement | undefined = $state();
	let iconEl: HTMLElement | undefined = $state();
	let factEl: HTMLElement | undefined = $state();
	let comparisonEl: HTMLElement | undefined = $state();

	// Animation effect with cleanup
	$effect(() => {
		if (!container || !factEl || !active) return;

		const shouldAnimate = !prefersReducedMotion.current;

		if (!shouldAnimate) {
			container.style.opacity = '1';
			if (iconEl) iconEl.style.opacity = '1';
			factEl.style.opacity = '1';
			if (comparisonEl) comparisonEl.style.opacity = '1';
			onAnimationComplete?.();
			return;
		}

		const animations: ReturnType<typeof animate>[] = [];

		// Animate container
		const containerAnim = animate(
			container,
			{ opacity: [0, 1] },
			{ duration: 0.4 }
		);
		animations.push(containerAnim);

		// Animate icon with bounce
		if (iconEl) {
			const iconAnim = animate(
				iconEl,
				{
					transform: ['scale(0) rotate(-180deg)', 'scale(1.2) rotate(10deg)', 'scale(1) rotate(0deg)'],
					opacity: [0, 1, 1]
				},
				{ type: 'spring', stiffness: 200, damping: 10, delay: 0.2 }
			);
			animations.push(iconAnim);
		}

		// Animate fact text
		const factAnim = animate(
			factEl,
			{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
			{ duration: 0.5, delay: 0.4 }
		);
		animations.push(factAnim);

		// Animate comparison if present
		if (comparisonEl && comparison) {
			const comparisonAnim = animate(
				comparisonEl,
				{ opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] },
				{ duration: 0.4, delay: 0.6 }
			);
			animations.push(comparisonAnim);

			comparisonAnim.finished.then(() => {
				onAnimationComplete?.();
			});
		} else {
			factAnim.finished.then(() => {
				onAnimationComplete?.();
			});
		}

		return () => {
			animations.forEach((a) => a.stop());
		};
	});
</script>

<BaseSlide {active} class="fun-fact-slide {klass}" variant="highlight">
	<div bind:this={container} class="content">
		<span bind:this={iconEl} class="icon" aria-hidden="true">{icon}</span>

		<h2 class="title">Fun Fact</h2>

		<p bind:this={factEl} class="fact">
			{fact}
		</p>

		{#if comparison}
			<p bind:this={comparisonEl} class="comparison">
				{comparison}
			</p>
		{/if}

		{#if children}
			<div class="extra">
				{@render children()}
			</div>
		{/if}
	</div>
</BaseSlide>

<style>
	.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		z-index: 1;
		max-width: 600px;
		text-align: center;
	}

	.icon {
		font-size: 4rem;
		line-height: 1;
		margin-bottom: 0.5rem;
	}

	.title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.15em;
	}

	.fact {
		font-size: clamp(1.5rem, 4vw, 2rem);
		font-weight: 700;
		color: var(--foreground);
		line-height: 1.4;
	}

	.comparison {
		font-size: 1.125rem;
		color: var(--primary);
		font-style: italic;
		margin-top: 0.5rem;
	}

	.extra {
		margin-top: 1.5rem;
	}
</style>
