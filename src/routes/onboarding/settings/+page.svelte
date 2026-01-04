<script lang="ts">
	import { animate } from 'motion';
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
	import { loadThemeFont } from '$lib/utils/theme-fonts';
	import type { ActionData, PageData } from './$types';

	/**
	 * Onboarding Step 3: Settings Configuration
	 *
	 * Step-by-step carousel for configuring appearance, privacy, slides, and AI features.
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Form state - initialized from server data, editable locally
	let uiTheme = $state(untrack(() => data.settings.uiTheme));
	let wrappedTheme = $state(untrack(() => data.settings.wrappedTheme));
	let anonymizationMode = $state(untrack(() => data.settings.anonymizationMode));
	let defaultShareMode = $state(untrack(() => data.settings.defaultShareMode));
	let allowUserControl = $state(untrack(() => data.settings.allowUserControl));
	let enableFunFacts = $state(untrack(() => data.funFactConfig.count > 0));
	let funFactFrequency = $state(untrack(() => data.funFactConfig.mode || 'normal'));

	// All available theme classes for removal
	const themeClasses = [
		'theme-modern-minimal',
		'theme-supabase',
		'theme-doom-64',
		'theme-amber-minimal',
		'theme-soviet-red',
		'theme-obsidian-premium',
		'theme-aurora-premium',
		'theme-champagne-premium'
	];

	// Live theme preview: Apply theme class when uiTheme changes
	$effect(() => {
		const themeClass = `theme-${uiTheme}`;

		// Remove all existing theme classes
		document.body.classList.remove(...themeClasses);

		// Add the current theme class
		document.body.classList.add(themeClass);

		// Load theme-specific font
		loadThemeFont(uiTheme);
	});

	// Slide toggles
	let slideStates = $state<Record<string, boolean>>(
		untrack(() => Object.fromEntries(data.slideOptions.map((s) => [s.type, s.enabled])))
	);

	// Compute enabled slides string
	let enabledSlidesString = $derived(
		Object.entries(slideStates)
			.filter(([_, enabled]) => enabled)
			.map(([type]) => type)
			.join(',')
	);

	// Loading state
	let isSubmitting = $state(false);

	// ==========================================================================
	// Carousel State
	// ==========================================================================

	interface SubStep {
		id: string;
		label: string;
		icon: 'appearance' | 'privacy' | 'slides' | 'ai';
	}

	// Build sub-steps array (AI only if configured) - reactive to data.hasOpenAI
	let subSteps = $derived([
		{ id: 'appearance', label: 'Appearance', icon: 'appearance' },
		{ id: 'privacy', label: 'Privacy', icon: 'privacy' },
		{ id: 'slides', label: 'Slides', icon: 'slides' },
		...(data.hasOpenAI ? [{ id: 'ai', label: 'AI Features', icon: 'ai' as const }] : [])
	] satisfies SubStep[]);

	let currentSubStep = $state(0);
	let contentRef: HTMLElement | undefined = $state();
	let animationDirection = $state<'forward' | 'backward'>('forward');

	// Derived values
	let totalSubSteps = $derived(subSteps.length);
	let isFirstSubStep = $derived(currentSubStep === 0);
	let isLastSubStep = $derived(currentSubStep === totalSubSteps - 1);
	// subSteps always has at least 3 items, and currentSubStep is bounded by navigation
	let currentStepData = $derived(subSteps[currentSubStep]!);

	// Navigation
	function nextSubStep() {
		if (currentSubStep < totalSubSteps - 1) {
			animationDirection = 'forward';
			currentSubStep += 1;
		}
	}

	function prevSubStep() {
		if (currentSubStep > 0) {
			animationDirection = 'backward';
			currentSubStep -= 1;
		}
	}

	function goToSubStep(index: number) {
		if (index >= 0 && index < totalSubSteps && index !== currentSubStep) {
			animationDirection = index > currentSubStep ? 'forward' : 'backward';
			currentSubStep = index;
		}
	}

	// Animate on sub-step change
	$effect(() => {
		if (!contentRef) return;
		const step = currentSubStep; // Track dependency

		const xOffset = animationDirection === 'forward' ? 30 : -30;

		// biome-ignore lint/suspicious/noExplicitAny: Motion's animate function has complex overloads
		(animate as any)(
			contentRef,
			{
				opacity: [0, 1],
				transform: [`translateX(${xOffset}px)`, 'translateX(0)']
			},
			{ duration: 0.3, easing: [0.22, 1, 0.36, 1] }
		);
	});

	// Theme color mapping for swatches
	const defaultColors = { primary: '#3b82f6', accent: '#60a5fa', bg: '#0f172a' };
	const themeColors: Record<string, { primary: string; accent: string; bg: string }> = {
		'modern-minimal': { primary: '#3b82f6', accent: '#60a5fa', bg: '#0f172a' },
		supabase: { primary: '#3ecf8e', accent: '#24b47e', bg: '#1c1c1c' },
		'doom-64': { primary: '#dc2626', accent: '#ef4444', bg: '#0a0a0a' },
		'amber-minimal': { primary: '#f59e0b', accent: '#fbbf24', bg: '#1a1410' },
		'soviet-red': { primary: '#b91c1c', accent: '#991b1b', bg: '#1a0a0a' }
	};

	function getThemeColors(themeValue: string) {
		return themeColors[themeValue] ?? defaultColors;
	}
</script>

<OnboardingCard
	title="Configure Your Experience"
	subtitle="Customize how Obzorarr looks and behaves. You can always change these later."
>
	{#snippet children()}
		<div class="settings-container">
			<!-- Error display -->
			{#if form?.error}
				<div class="error-banner">
					<svg
						class="error-icon"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="15" y1="9" x2="9" y2="15" />
						<line x1="9" y1="9" x2="15" y2="15" />
					</svg>
					<span>{form.error}</span>
				</div>
			{/if}

			<!-- Sub-step Progress Indicator -->
			<div class="substep-indicator">
				<div class="substep-info">
					<span class="substep-current">{currentStepData.label}</span>
					<span class="substep-count">{currentSubStep + 1} of {totalSubSteps}</span>
				</div>
				<div class="substep-dots">
					{#each subSteps as step, index}
						<button
							type="button"
							class="substep-dot"
							class:active={index === currentSubStep}
							class:completed={index < currentSubStep}
							onclick={() => goToSubStep(index)}
							aria-label="Go to {step.label}"
						>
							{#if index < currentSubStep}
								<svg
									class="dot-check"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="3"
								>
									<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			</div>

			<form
				method="POST"
				action="?/saveSettings"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
					};
				}}
			>
				<!-- Hidden fields for form data (always rendered) -->
				<input type="hidden" name="uiTheme" value={uiTheme} />
				<input type="hidden" name="wrappedTheme" value={wrappedTheme} />
				<input type="hidden" name="anonymizationMode" value={anonymizationMode} />
				<input type="hidden" name="defaultShareMode" value={defaultShareMode} />
				<input type="hidden" name="allowUserControl" value={allowUserControl} />
				<input type="hidden" name="enabledSlides" value={enabledSlidesString} />
				<input type="hidden" name="enableFunFacts" value={enableFunFacts} />
				<input type="hidden" name="funFactFrequency" value={funFactFrequency} />

				<!-- Carousel Content -->
				<div class="carousel-content" bind:this={contentRef}>
					{#if currentStepData.id === 'appearance'}
						<!-- Appearance Step -->
						<div class="step-header">
							<div class="step-icon appearance-icon">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<circle cx="12" cy="12" r="3" />
									<path
										d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
									/>
								</svg>
							</div>
							<div class="step-title">
								<h3>Appearance</h3>
								<p>Choose your visual theme</p>
							</div>
						</div>

						<div class="step-fields">
							<div class="setting-group">
								<span class="setting-label">Dashboard Theme</span>
								<p class="setting-description">Applied to the dashboard and admin pages</p>
								<div class="theme-swatches">
									{#each data.themeOptions as option}
										{@const colors = getThemeColors(option.value)}
										<button
											type="button"
											class="theme-swatch"
											class:selected={uiTheme === option.value}
											onclick={() => (uiTheme = option.value)}
											style="--swatch-primary: {colors.primary}; --swatch-accent: {colors.accent}; --swatch-bg: {colors.bg}"
										>
											<div class="swatch-preview">
												<div class="swatch-bar"></div>
												<div class="swatch-dots">
													<span></span><span></span><span></span>
												</div>
											</div>
											<span class="swatch-label">{option.label}</span>
										</button>
									{/each}
								</div>
							</div>

							<div class="setting-group">
								<span class="setting-label">Wrapped Presentation Theme</span>
								<p class="setting-description">Applied to the animated year-end slideshow</p>
								<div class="theme-swatches">
									{#each data.themeOptions as option}
										{@const colors = getThemeColors(option.value)}
										<button
											type="button"
											class="theme-swatch"
											class:selected={wrappedTheme === option.value}
											onclick={() => (wrappedTheme = option.value)}
											style="--swatch-primary: {colors.primary}; --swatch-accent: {colors.accent}; --swatch-bg: {colors.bg}"
										>
											<div class="swatch-preview">
												<div class="swatch-bar"></div>
												<div class="swatch-dots">
													<span></span><span></span><span></span>
												</div>
											</div>
											<span class="swatch-label">{option.label}</span>
										</button>
									{/each}
								</div>
							</div>
						</div>
					{:else if currentStepData.id === 'privacy'}
						<!-- Privacy Step -->
						<div class="step-header">
							<div class="step-icon privacy-icon">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
									<path d="M9 12l2 2 4-4" />
								</svg>
							</div>
							<div class="step-title">
								<h3>Privacy & Sharing</h3>
								<p>Control visibility and access</p>
							</div>
						</div>

						<div class="step-fields">
							<div class="setting-group">
								<span class="setting-label">User Identity in Stats</span>
								<p class="setting-description">How usernames appear in server-wide statistics</p>
								<div class="radio-cards">
									{#each data.anonymizationOptions as option}
										<label class="radio-card" class:selected={anonymizationMode === option.value}>
											<input
												type="radio"
												name="anonymizationModeRadio"
												value={option.value}
												checked={anonymizationMode === option.value}
												onchange={() => (anonymizationMode = option.value)}
											/>
											<div class="radio-card-content">
												<div class="radio-indicator">
													<div class="radio-dot"></div>
												</div>
												<div class="radio-text">
													<span class="radio-label">{option.label}</span>
													<span class="radio-description">{option.description}</span>
												</div>
											</div>
										</label>
									{/each}
								</div>
							</div>

							<div class="setting-group">
								<span class="setting-label">Default Sharing Mode</span>
								<p class="setting-description">How wrapped pages are shared by default</p>
								<div class="radio-cards">
									{#each data.shareModeOptions as option}
										<label class="radio-card" class:selected={defaultShareMode === option.value}>
											<input
												type="radio"
												name="shareModeRadio"
												value={option.value}
												checked={defaultShareMode === option.value}
												onchange={() => (defaultShareMode = option.value)}
											/>
											<div class="radio-card-content">
												<div class="radio-indicator">
													<div class="radio-dot"></div>
												</div>
												<div class="radio-text">
													<span class="radio-label">{option.label}</span>
													<span class="radio-description">{option.description}</span>
												</div>
											</div>
										</label>
									{/each}
								</div>
							</div>

							<div class="setting-group">
								<label class="toggle-row">
									<div class="toggle-text">
										<span class="toggle-label">Allow User Control</span>
										<span class="toggle-description"
											>Let users change their own sharing settings</span
										>
									</div>
									<button
										type="button"
										class="toggle-switch"
										class:active={allowUserControl}
										onclick={() => (allowUserControl = !allowUserControl)}
										aria-pressed={allowUserControl}
										aria-label="Allow User Control"
									>
										<span class="toggle-knob"></span>
									</button>
								</label>
							</div>
						</div>
					{:else if currentStepData.id === 'slides'}
						<!-- Slides Step -->
						<div class="step-header">
							<div class="step-icon slides-icon">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<rect x="2" y="3" width="20" height="14" rx="2" />
									<path d="M8 21h8M12 17v4" />
								</svg>
							</div>
							<div class="step-title">
								<h3>Slides</h3>
								<p>Choose which slides to display</p>
							</div>
						</div>

						<div class="step-fields">
							<div class="slides-grid">
								{#each data.slideOptions as slide, i}
									<label
										class="slide-toggle"
										class:enabled={slideStates[slide.type]}
										style="--delay: {i * 30}ms"
									>
										<div class="slide-info">
											<span class="slide-name">{slide.label}</span>
										</div>
										<button
											type="button"
											class="toggle-switch small"
											class:active={slideStates[slide.type]}
											onclick={() => (slideStates[slide.type] = !slideStates[slide.type])}
											aria-pressed={slideStates[slide.type]}
											aria-label="Toggle {slide.label}"
										>
											<span class="toggle-knob"></span>
										</button>
									</label>
								{/each}
							</div>
						</div>
					{:else if currentStepData.id === 'ai'}
						<!-- AI Features Step -->
						<div class="step-header">
							<div class="step-icon ai-icon">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
									<path
										d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2z"
									/>
									<circle cx="8" cy="14" r="1" />
									<circle cx="16" cy="14" r="1" />
								</svg>
							</div>
							<div class="step-title">
								<h3>AI Features</h3>
								<p>AI-powered fun facts and insights</p>
							</div>
						</div>

						<div class="step-fields">
							<div class="setting-group">
								<label class="toggle-row">
									<div class="toggle-text">
										<span class="toggle-label">Enable AI Fun Facts</span>
										<span class="toggle-description"
											>Generate personalized fun facts about viewing habits</span
										>
									</div>
									<button
										type="button"
										class="toggle-switch"
										class:active={enableFunFacts}
										onclick={() => (enableFunFacts = !enableFunFacts)}
										aria-pressed={enableFunFacts}
										aria-label="Enable AI Fun Facts"
									>
										<span class="toggle-knob"></span>
									</button>
								</label>
							</div>

							{#if enableFunFacts}
								<div class="setting-group frequency-group">
									<span class="setting-label">Fun Fact Frequency</span>
									<div class="frequency-options">
										{#each data.funFactOptions as option}
											<label
												class="frequency-option"
												class:selected={funFactFrequency === option.value}
											>
												<input
													type="radio"
													name="frequencyRadio"
													value={option.value}
													checked={funFactFrequency === option.value}
													onchange={() => (funFactFrequency = option.value)}
												/>
												<span class="frequency-label">{option.label}</span>
												<span class="frequency-desc">{option.description}</span>
											</label>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Submit button (hidden) -->
				<button type="submit" class="hidden-submit" disabled={isSubmitting}>Save</button>
			</form>
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="footer-actions">
			<!-- Previous Button -->
			<button
				type="button"
				class="btn-nav btn-prev"
				disabled={isFirstSubStep || isSubmitting}
				onclick={prevSubStep}
			>
				<svg
					class="nav-arrow"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M19 12H5M12 19l-7-7 7-7" />
				</svg>
				Previous
			</button>

			<!-- Skip Link (center) -->
			<form method="POST" action="?/skipSettings" use:enhance class="skip-form">
				<button type="submit" class="btn-skip-link" disabled={isSubmitting}> Skip setup </button>
			</form>

			<!-- Next / Save Button -->
			{#if isLastSubStep}
				<button
					type="button"
					class="btn-nav btn-save"
					disabled={isSubmitting}
					onclick={() => {
						const form = document.querySelector('form[action="?/saveSettings"]') as HTMLFormElement;
						form?.requestSubmit();
					}}
				>
					{#if isSubmitting}
						<span class="spinner"></span>
						Saving...
					{:else}
						Save & Continue
						<svg
							class="nav-arrow"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M5 12h14M12 5l7 7-7 7" />
						</svg>
					{/if}
				</button>
			{:else}
				<button
					type="button"
					class="btn-nav btn-next"
					disabled={isSubmitting}
					onclick={nextSubStep}
				>
					Next
					<svg
						class="nav-arrow"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M5 12h14M12 5l7 7-7 7" />
					</svg>
				</button>
			{/if}
		</div>
	{/snippet}
</OnboardingCard>

<style>
	/* Container */
	.settings-container {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	/* Error Banner */
	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 0.75rem;
		color: #fca5a5;
		font-size: 0.875rem;
		margin-bottom: 0.5rem;
	}

	.error-icon {
		width: 1.25rem;
		height: 1.25rem;
		flex-shrink: 0;
		color: #f87171;
	}

	/* Hidden submit */
	.hidden-submit {
		position: absolute;
		left: -9999px;
	}

	/* ==========================================================================
	   Sub-step Progress Indicator
	   ========================================================================== */
	.substep-indicator {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.875rem 1rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid hsl(var(--primary) / 0.1);
		border-radius: 0.875rem;
		margin-bottom: 1rem;
	}

	.substep-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.substep-current {
		font-size: 0.9rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
		font-family: 'DM Sans', system-ui, sans-serif;
	}

	.substep-count {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.45);
		font-variant-numeric: tabular-nums;
	}

	.substep-dots {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.substep-dot {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.15);
		background: rgba(0, 0, 0, 0.2);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
	}

	.substep-dot:hover {
		border-color: rgba(255, 255, 255, 0.3);
		background: rgba(255, 255, 255, 0.05);
	}

	.substep-dot.completed {
		border-color: hsl(142, 71%, 45%);
		background: linear-gradient(135deg, hsl(142, 71%, 45%) 0%, hsl(142, 71%, 35%) 100%);
	}

	.substep-dot.active {
		border-color: hsl(var(--primary));
		background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%);
		box-shadow: 0 0 12px hsl(var(--primary) / 0.4);
	}

	.dot-check {
		width: 0.875rem;
		height: 0.875rem;
		color: white;
	}

	/* ==========================================================================
	   Carousel Content
	   ========================================================================== */
	.carousel-content {
		min-height: 320px;
	}

	.step-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.step-icon {
		width: 3rem;
		height: 3rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 0.875rem;
		flex-shrink: 0;
	}

	.step-icon svg {
		width: 1.5rem;
		height: 1.5rem;
	}

	.step-icon.appearance-icon {
		background: linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.1));
		color: #fbbf24;
	}

	.step-icon.privacy-icon {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1));
		color: #60a5fa;
	}

	.step-icon.slides-icon {
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.2), rgba(139, 92, 246, 0.1));
		color: #a78bfa;
	}

	.step-icon.ai-icon {
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(22, 163, 74, 0.1));
		color: #4ade80;
	}

	.step-title h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
		font-family: 'DM Sans', system-ui, sans-serif;
	}

	.step-title p {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.step-fields {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	/* ==========================================================================
	   Navigation Buttons
	   ========================================================================== */
	.footer-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		width: 100%;
	}

	.skip-form {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
	}

	.btn-skip-link {
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.4);
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0.5rem 1rem;
		transition: color 0.2s ease;
		text-decoration: underline;
		text-decoration-color: transparent;
		text-underline-offset: 2px;
	}

	.btn-skip-link:hover:not(:disabled) {
		color: rgba(255, 255, 255, 0.6);
		text-decoration-color: currentColor;
	}

	.btn-skip-link:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem;
		border-radius: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.btn-prev {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.7);
	}

	.btn-prev:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.05);
		border-color: rgba(255, 255, 255, 0.25);
		color: rgba(255, 255, 255, 0.9);
	}

	.btn-prev:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.btn-next {
		background: hsl(var(--primary) / 0.15);
		border: 1px solid hsl(var(--primary) / 0.3);
		color: hsl(var(--primary));
	}

	.btn-next:hover:not(:disabled) {
		background: hsl(var(--primary) / 0.25);
		border-color: hsl(var(--primary) / 0.5);
		transform: translateX(2px);
	}

	.btn-save {
		background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%);
		border: none;
		color: hsl(var(--primary-foreground));
		font-weight: 600;
		box-shadow: 0 4px 16px hsl(var(--primary) / 0.25);
	}

	.btn-save:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow: 0 6px 24px hsl(var(--primary) / 0.35);
	}

	.btn-save:disabled {
		opacity: 0.7;
		cursor: not-allowed;
		transform: none;
	}

	.nav-arrow {
		width: 1rem;
		height: 1rem;
		transition: transform 0.2s ease;
	}

	.btn-next:hover:not(:disabled) .nav-arrow {
		transform: translateX(2px);
	}

	.btn-prev:hover:not(:disabled) .nav-arrow {
		transform: translateX(-2px);
	}
	/* Setting Groups */
	.setting-group {
		margin-top: 1.25rem;
	}

	.setting-group:first-child {
		margin-top: 0;
	}

	.setting-label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
		margin-bottom: 0.25rem;
	}

	.setting-description {
		display: block;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.45);
		margin-bottom: 0.75rem;
	}

	/* Theme Swatches */
	.theme-swatches {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
		gap: 0.625rem;
	}

	.theme-swatch {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem;
		background: rgba(0, 0, 0, 0.2);
		border: 2px solid transparent;
		border-radius: 0.75rem;
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.theme-swatch:hover {
		background: rgba(0, 0, 0, 0.3);
		transform: translateY(-2px);
	}

	.theme-swatch.selected {
		border-color: var(--swatch-primary);
		background: rgba(0, 0, 0, 0.35);
		box-shadow: 0 0 16px color-mix(in srgb, var(--swatch-primary) 30%, transparent);
	}

	.swatch-preview {
		width: 100%;
		aspect-ratio: 16/10;
		background: var(--swatch-bg);
		border-radius: 0.375rem;
		padding: 0.375rem;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		overflow: hidden;
	}

	.swatch-bar {
		height: 4px;
		width: 70%;
		background: linear-gradient(90deg, var(--swatch-primary), var(--swatch-accent));
		border-radius: 2px;
	}

	.swatch-dots {
		display: flex;
		gap: 3px;
	}

	.swatch-dots span {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--swatch-primary);
		opacity: 0.6;
	}

	.swatch-label {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.7);
		text-align: center;
		line-height: 1.2;
	}

	/* Radio Cards */
	.radio-cards {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.radio-card {
		position: relative;
		cursor: pointer;
	}

	.radio-card input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.radio-card-content {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 0.875rem 1rem;
		background: rgba(0, 0, 0, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.75rem;
		transition: all 0.25s ease;
	}

	.radio-card:hover .radio-card-content {
		background: rgba(0, 0, 0, 0.25);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.radio-card.selected .radio-card-content {
		background: hsl(var(--primary) / 0.08);
		border-color: hsl(var(--primary) / 0.35);
	}

	.radio-indicator {
		width: 1.125rem;
		height: 1.125rem;
		border: 2px solid rgba(255, 255, 255, 0.25);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		margin-top: 0.125rem;
		transition: all 0.25s ease;
	}

	.radio-card.selected .radio-indicator {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary));
	}

	.radio-dot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		background: transparent;
		transition: all 0.2s ease;
	}

	.radio-card.selected .radio-dot {
		background: hsl(var(--primary-foreground));
	}

	.radio-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.radio-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
	}

	.radio-description {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.45);
	}

	/* Toggle Switch */
	.toggle-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.875rem 1rem;
		background: rgba(0, 0, 0, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.75rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.toggle-row:hover {
		background: rgba(0, 0, 0, 0.25);
	}

	.toggle-text {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.toggle-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
	}

	.toggle-description {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.45);
	}

	.toggle-switch {
		position: relative;
		width: 2.75rem;
		height: 1.5rem;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 0.75rem;
		cursor: pointer;
		flex-shrink: 0;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.toggle-switch.small {
		width: 2.25rem;
		height: 1.25rem;
	}

	.toggle-switch:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.toggle-switch.active {
		background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)));
	}

	.toggle-knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: calc(1.5rem - 6px);
		height: calc(1.5rem - 6px);
		background: white;
		border-radius: 50%;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.toggle-switch.small .toggle-knob {
		width: calc(1.25rem - 6px);
		height: calc(1.25rem - 6px);
	}

	.toggle-switch.active .toggle-knob {
		transform: translateX(1.25rem);
	}

	.toggle-switch.small.active .toggle-knob {
		transform: translateX(1rem);
	}

	/* Slides Grid */
	.slides-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	@media (max-width: 480px) {
		.slides-grid {
			grid-template-columns: 1fr;
		}
	}

	.slide-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: rgba(0, 0, 0, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 0.625rem;
		cursor: pointer;
		transition: all 0.25s ease;
		animation: slideIn 0.3s ease both;
		animation-delay: var(--delay);
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.slide-toggle:hover {
		background: rgba(0, 0, 0, 0.25);
	}

	.slide-toggle.enabled {
		border-color: hsl(var(--primary) / 0.2);
	}

	.slide-name {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.8);
	}

	/* Frequency Options */
	.frequency-group {
		padding-left: 1.5rem;
		border-left: 2px solid hsl(var(--primary) / 0.2);
		animation: fadeSlide 0.3s ease;
	}

	@keyframes fadeSlide {
		from {
			opacity: 0;
			transform: translateX(-10px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.frequency-options {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.frequency-option {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.625rem 1rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 0.625rem;
		cursor: pointer;
		transition: all 0.2s ease;
		flex: 1;
		min-width: 80px;
	}

	.frequency-option input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.frequency-option:hover {
		background: rgba(0, 0, 0, 0.3);
	}

	.frequency-option.selected {
		background: hsl(var(--primary) / 0.1);
		border-color: hsl(var(--primary) / 0.4);
	}

	.frequency-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
	}

	.frequency-desc {
		font-size: 0.7rem;
		color: rgba(255, 255, 255, 0.45);
	}

	/* Spinner */
	.spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid hsl(var(--primary-foreground) / 0.3);
		border-top-color: hsl(var(--primary-foreground));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ==========================================================================
	   Mobile Responsive
	   ========================================================================== */
	@media (max-width: 480px) {
		/* Sub-step indicator */
		.substep-indicator {
			flex-direction: column;
			gap: 0.75rem;
			text-align: center;
		}

		.substep-info {
			align-items: center;
		}

		.substep-dots {
			gap: 0.375rem;
		}

		.substep-dot {
			width: 1.5rem;
			height: 1.5rem;
		}

		.dot-check {
			width: 0.75rem;
			height: 0.75rem;
		}

		/* Carousel content */
		.carousel-content {
			min-height: 280px;
		}

		.step-header {
			flex-direction: column;
			text-align: center;
			gap: 0.75rem;
		}

		.step-icon {
			width: 2.5rem;
			height: 2.5rem;
		}

		.step-icon svg {
			width: 1.25rem;
			height: 1.25rem;
		}

		.step-title h3 {
			font-size: 1rem;
		}

		/* Theme swatches */
		.theme-swatches {
			grid-template-columns: repeat(3, 1fr);
		}

		/* Footer navigation */
		.footer-actions {
			position: relative;
			justify-content: space-between;
		}

		.skip-form {
			position: static;
			transform: none;
			order: -1;
			width: 100%;
			text-align: center;
			margin-bottom: 0.5rem;
		}

		.btn-nav {
			padding: 0.625rem 1rem;
			font-size: 0.8rem;
		}

		.btn-skip-link {
			font-size: 0.75rem;
		}
	}

	@media (max-width: 360px) {
		.substep-dot {
			width: 1.25rem;
			height: 1.25rem;
		}

		.theme-swatches {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
