<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { animate, stagger } from 'motion';

	interface Step {
		id: string;
		label: string;
	}

	interface Props {
		steps: Step[];
		currentStep: number;
	}

	let { steps, currentStep }: Props = $props();

	let containerRef: HTMLElement | undefined = $state();

	const getStepStatus = (index: number): 'completed' | 'active' | 'pending' => {
		if (index < currentStep) return 'completed';
		if (index === currentStep) return 'active';
		return 'pending';
	};

	// Animate on mount
	$effect(() => {
		if (!containerRef) return;

		const stepElements = containerRef.querySelectorAll('.step-item');
		if (stepElements.length === 0) return;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(animate as any)(
			stepElements,
			{ opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
			{ duration: 0.5, delay: stagger(0.1), easing: [0.22, 1, 0.36, 1] }
		);
	});
</script>

<nav bind:this={containerRef} class="step-indicator" aria-label="Setup progress">
	<div class="step-track">
		{#each steps as step, index}
			{@const status = getStepStatus(index)}
			<div
				class="step-item"
				class:completed={status === 'completed'}
				class:active={status === 'active'}
				class:pending={status === 'pending'}
				aria-current={status === 'active' ? 'step' : undefined}
			>
				<div class="step-node">
					<div class="step-circle">
						{#if status === 'completed'}
							<Check class="check-icon" size={14} strokeWidth={3} />
						{:else}
							<span class="step-number">{index + 1}</span>
						{/if}
					</div>
					{#if index < steps.length - 1}
						<div class="step-connector">
							<div class="connector-fill" class:filled={index < currentStep}></div>
						</div>
					{/if}
				</div>
				<span class="step-label">{step.label}</span>
			</div>
		{/each}
	</div>
</nav>

<style>
	.step-indicator {
		width: 100%;
		padding: 0 1rem;
	}

	.step-track {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		gap: 0;
		max-width: 600px;
		margin: 0 auto;
	}

	.step-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: 1;
		max-width: 140px;
		opacity: 0; /* Start hidden for animation */
	}

	.step-node {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		position: relative;
	}

	.step-circle {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.875rem;
		transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
		position: relative;
		z-index: 2;
		flex-shrink: 0;
	}

	/* Pending state */
	.pending .step-circle {
		background: rgba(255, 255, 255, 0.05);
		border: 2px solid rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.4);
	}

	/* Active state - uses theme primary color */
	.active .step-circle {
		background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%);
		border: 2px solid hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		box-shadow:
			0 0 20px hsl(var(--primary) / 0.4),
			0 0 40px hsl(var(--primary) / 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
		animation: pulse-glow 2s ease-in-out infinite;
	}

	/* Completed state */
	.completed .step-circle {
		background: linear-gradient(135deg, hsl(142, 71%, 45%) 0%, hsl(142, 71%, 35%) 100%);
		border: 2px solid hsl(142, 71%, 50%);
		color: white;
		box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
	}

	@keyframes pulse-glow {
		0%,
		100% {
			box-shadow:
				0 0 20px hsl(var(--primary) / 0.4),
				0 0 40px hsl(var(--primary) / 0.2),
				inset 0 1px 0 rgba(255, 255, 255, 0.3);
		}
		50% {
			box-shadow:
				0 0 25px hsl(var(--primary) / 0.5),
				0 0 50px hsl(var(--primary) / 0.3),
				inset 0 1px 0 rgba(255, 255, 255, 0.3);
		}
	}

	.step-number {
		font-variant-numeric: tabular-nums;
	}

	.step-connector {
		position: absolute;
		left: calc(50% + 18px + 4px); /* Circle center + radius + gap */
		right: calc(-50% + 18px + 4px); /* Extend to next circle edge */
		top: 50%;
		transform: translateY(-50%);
		height: 2px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 1px;
		overflow: hidden;
		z-index: 1;
	}

	.connector-fill {
		width: 0%;
		height: 100%;
		background: linear-gradient(90deg, hsl(142, 71%, 45%) 0%, hsl(var(--primary)) 100%);
		border-radius: 1px;
		transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.connector-fill.filled {
		width: 100%;
	}

	.step-label {
		margin-top: 0.75rem;
		font-size: 0.75rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		text-align: center;
		transition: color 0.3s ease;
		white-space: nowrap;
	}

	.pending .step-label {
		color: rgba(255, 255, 255, 0.35);
	}

	.active .step-label {
		color: hsl(var(--primary));
	}

	.completed .step-label {
		color: rgba(255, 255, 255, 0.7);
	}

	/* Responsive */
	@media (max-width: 480px) {
		.step-indicator {
			padding: 0 0.5rem;
		}

		.step-circle {
			width: 32px;
			height: 32px;
			font-size: 0.8rem;
		}

		.step-label {
			font-size: 0.65rem;
		}

		.step-connector {
			left: calc(50% + 16px + 3px); /* Smaller circle radius + smaller gap */
			right: calc(-50% + 16px + 3px);
		}
	}
</style>
