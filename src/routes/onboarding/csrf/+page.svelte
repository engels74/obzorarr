<script lang="ts">
	import { enhance } from '$app/forms';
	import { animate, stagger } from 'motion';
	import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const initialOrigin = data.csrfConfig.value || data.detection.detectedOrigin;
	let csrfOriginInput = $state(initialOrigin);
	let isSubmitting = $state(false);

	let iconRef: HTMLElement | undefined = $state();
	let contentRef: HTMLElement | undefined = $state();
	let animatedElements = new WeakSet<Element>();

	$effect(() => {
		if (!iconRef) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const animation = (animate as any)(
			iconRef,
			{
				opacity: [0, 1],
				transform: ['scale(0.8)', 'scale(1)']
			},
			{ duration: 0.5, easing: [0.22, 1, 0.36, 1] }
		);
		return () => animation.stop?.();
	});

	$effect(() => {
		if (!contentRef) return;

		const rafId = requestAnimationFrame(() => {
			if (!contentRef) return;
			const items = contentRef.querySelectorAll('.animate-item');
			const newItems = Array.from(items).filter((item) => !animatedElements.has(item));

			if (newItems.length === 0) return;

			newItems.forEach((item) => animatedElements.add(item));

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(animate as any)(
				newItems,
				{ opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0)'] },
				{ duration: 0.4, delay: stagger(0.08), easing: [0.22, 1, 0.36, 1] }
			);
		});

		return () => cancelAnimationFrame(rafId);
	});

	function useDetectedOrigin() {
		csrfOriginInput = data.detection.detectedOrigin;
	}
</script>

<OnboardingCard title="Security Settings" subtitle="Configure CSRF protection for your application">
	<div class="csrf-content" bind:this={contentRef}>
		<div class="icon-container" bind:this={iconRef}>
			<div class="icon-wrapper">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path
						d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>
		</div>

		<div class="detection-card animate-item">
			<div class="detection-header">
				<svg
					class="detection-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<circle cx="12" cy="12" r="10" />
					<path d="M12 16v-4" stroke-linecap="round" />
					<path d="M12 8h.01" stroke-linecap="round" />
				</svg>
				<span class="detection-title">Connection Details</span>
			</div>
			<div class="detection-content">
				<div class="detection-row">
					<span class="detection-label">Access Type</span>
					<span class="detection-value {data.detection.isReverseProxy ? 'proxy' : 'direct'}">
						{#if data.detection.isReverseProxy}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path
									d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
								<polyline points="15,3 21,3 21,9" stroke-linecap="round" stroke-linejoin="round" />
								<line x1="10" y1="14" x2="21" y2="3" stroke-linecap="round" />
							</svg>
							Reverse Proxy
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<rect
									x="2"
									y="3"
									width="20"
									height="14"
									rx="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
								<line x1="8" y1="21" x2="16" y2="21" stroke-linecap="round" />
								<line x1="12" y1="17" x2="12" y2="21" stroke-linecap="round" />
							</svg>
							Direct Access
						{/if}
					</span>
				</div>
				<div class="detection-row">
					<span class="detection-label">Detected Origin</span>
					<span class="detection-value origin">{data.detection.detectedOrigin}</span>
				</div>
			</div>
		</div>

		{#if data.csrfConfig.isLocked}
			<div class="preconfigured-card animate-item">
				<div class="preconfigured-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<path
							d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
				<div class="preconfigured-info">
					<div class="preconfigured-header">
						<span class="preconfigured-title">CSRF Origin</span>
						<span class="preconfigured-badge">
							<svg
								class="lock-icon"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
								<path d="M7 11V7a5 5 0 0110 0v4" />
							</svg>
							ENV
						</span>
					</div>
					<span class="preconfigured-url">{data.csrfConfig.value}</span>
				</div>
				<div class="preconfigured-check">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
			</div>

			<p class="info-text animate-item">
				CSRF protection is configured via the <code>ORIGIN</code> environment variable. This setting is
				locked and cannot be changed here.
			</p>
		{:else}
			<div class="input-section animate-item">
				<label for="csrfOrigin" class="input-label">CSRF Origin URL</label>
				<div class="input-wrapper">
					<input
						type="url"
						id="csrfOrigin"
						name="csrfOrigin"
						bind:value={csrfOriginInput}
						placeholder="https://your-domain.com"
						class="origin-input"
						class:error={form?.error}
						form="csrf-form"
					/>
					{#if csrfOriginInput !== data.detection.detectedOrigin}
						<button type="button" class="use-detected-btn" onclick={useDetectedOrigin}>
							Use Detected
						</button>
					{/if}
				</div>
				{#if form?.error}
					<span class="error-message">{form.error}</span>
				{/if}
				<p class="input-hint">
					Enter the public URL where users will access Obzorarr. This protects against cross-site
					request forgery attacks.
				</p>
			</div>

			<div class="info-callout animate-item">
				<svg
					class="callout-icon"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<div class="callout-content">
					<span class="callout-title">Why configure CSRF protection?</span>
					<span class="callout-text">
						{#if data.detection.isReverseProxy}
							You appear to be accessing through a reverse proxy. Setting the correct origin URL
							ensures form submissions are validated against the actual URL users see.
						{:else}
							CSRF protection validates that form submissions come from your application's domain.
							If you plan to use a reverse proxy later, you can configure this setting now.
						{/if}
					</span>
				</div>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<div class="button-group">
			<form
				method="POST"
				action="?/skipCsrf"
				use:enhance={() => {
					isSubmitting = true;
					return async ({ update }) => {
						await update();
						isSubmitting = false;
					};
				}}
			>
				<button type="submit" class="skip-btn" disabled={isSubmitting}>
					{data.csrfConfig.isLocked ? 'Continue' : 'Skip'}
				</button>
			</form>

			{#if !data.csrfConfig.isLocked}
				<form
					id="csrf-form"
					method="POST"
					action="?/saveOrigin"
					use:enhance={() => {
						isSubmitting = true;
						return async ({ update }) => {
							await update();
							isSubmitting = false;
						};
					}}
				>
					<button type="submit" class="save-btn" disabled={isSubmitting || !csrfOriginInput}>
						{#if isSubmitting}
							<span class="spinner"></span>
						{/if}
						Save & Continue
					</button>
				</form>
			{/if}
		</div>
	{/snippet}
</OnboardingCard>

<style>
	.csrf-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
	}

	.icon-container {
		display: flex;
		justify-content: center;
		margin-bottom: 0.5rem;
	}

	.icon-wrapper {
		width: 72px;
		height: 72px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%);
		border-radius: 18px;
		color: hsl(217, 91%, 60%);
	}

	.icon-wrapper svg {
		width: 40px;
		height: 40px;
	}

	/* Detection Card */
	.detection-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		padding: 1rem 1.25rem;
	}

	.detection-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.875rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.detection-icon {
		width: 18px;
		height: 18px;
		color: rgba(255, 255, 255, 0.5);
	}

	.detection-title {
		font-size: 0.8rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.detection-content {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.detection-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.detection-label {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.detection-value {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.9);
	}

	.detection-value svg {
		width: 14px;
		height: 14px;
	}

	.detection-value.proxy {
		color: hsl(217, 91%, 65%);
	}

	.detection-value.direct {
		color: hsl(142, 71%, 55%);
	}

	.detection-value.origin {
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.7);
	}

	/* Preconfigured Card */
	.preconfigured-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.125rem 1.25rem;
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.02) 100%);
		border: 1px solid rgba(34, 197, 94, 0.2);
		border-radius: 12px;
		width: 100%;
		position: relative;
		overflow: hidden;
	}

	.preconfigured-card::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(ellipse at top left, rgba(34, 197, 94, 0.1) 0%, transparent 50%);
		pointer-events: none;
	}

	.preconfigured-icon {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(34, 197, 94, 0.12);
		border-radius: 11px;
		color: hsl(142, 71%, 55%);
		position: relative;
	}

	.preconfigured-icon svg {
		width: 24px;
		height: 24px;
	}

	.preconfigured-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
	}

	.preconfigured-header {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex-wrap: wrap;
	}

	.preconfigured-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
	}

	.preconfigured-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.5rem;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: rgba(34, 197, 94, 0.15);
		color: hsl(142, 71%, 60%);
		border-radius: 5px;
		border: 1px solid rgba(34, 197, 94, 0.3);
	}

	.preconfigured-badge .lock-icon {
		width: 10px;
		height: 10px;
	}

	.preconfigured-url {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.45);
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
		letter-spacing: -0.01em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.preconfigured-check {
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(34, 197, 94, 0.15);
		border-radius: 50%;
		color: hsl(142, 71%, 55%);
	}

	.preconfigured-check svg {
		width: 15px;
		height: 15px;
	}

	.info-text {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.5);
		line-height: 1.5;
		text-align: center;
	}

	.info-text code {
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
		font-size: 0.8rem;
		background: rgba(255, 255, 255, 0.08);
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		color: rgba(255, 255, 255, 0.7);
	}

	/* Input Section */
	.input-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.input-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.8);
	}

	.input-wrapper {
		position: relative;
		display: flex;
		gap: 0.5rem;
	}

	.origin-input {
		flex: 1;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		font-size: 0.9rem;
		color: rgba(255, 255, 255, 0.95);
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
		transition:
			border-color 0.2s,
			background 0.2s;
	}

	.origin-input::placeholder {
		color: rgba(255, 255, 255, 0.3);
	}

	.origin-input:focus {
		outline: none;
		border-color: rgba(59, 130, 246, 0.5);
		background: rgba(255, 255, 255, 0.07);
	}

	.origin-input.error {
		border-color: rgba(239, 68, 68, 0.5);
	}

	.use-detected-btn {
		flex-shrink: 0;
		padding: 0.5rem 0.75rem;
		background: rgba(59, 130, 246, 0.12);
		border: 1px solid rgba(59, 130, 246, 0.3);
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(217, 91%, 65%);
		cursor: pointer;
		transition:
			background 0.2s,
			border-color 0.2s;
	}

	.use-detected-btn:hover {
		background: rgba(59, 130, 246, 0.2);
		border-color: rgba(59, 130, 246, 0.5);
	}

	.error-message {
		font-size: 0.8rem;
		color: hsl(0, 84%, 60%);
	}

	.input-hint {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.45);
		line-height: 1.5;
	}

	/* Info Callout */
	.info-callout {
		display: flex;
		gap: 0.875rem;
		padding: 1rem 1.125rem;
		background: rgba(59, 130, 246, 0.06);
		border: 1px solid rgba(59, 130, 246, 0.15);
		border-radius: 10px;
	}

	.callout-icon {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		color: hsl(217, 91%, 60%);
		margin-top: 0.125rem;
	}

	.callout-content {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.callout-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
	}

	.callout-text {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.55);
		line-height: 1.5;
	}

	/* Button Group */
	.button-group {
		display: flex;
		gap: 0.75rem;
		width: 100%;
	}

	.skip-btn {
		flex: 1;
		padding: 0.875rem 1.5rem;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px;
		font-size: 0.9rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition:
			background 0.2s,
			border-color 0.2s;
	}

	.skip-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
	}

	.skip-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.save-btn {
		flex: 2;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.875rem 1.5rem;
		background: linear-gradient(135deg, hsl(217, 91%, 55%) 0%, hsl(217, 91%, 50%) 100%);
		border: none;
		border-radius: 10px;
		font-size: 0.9rem;
		font-weight: 600;
		color: white;
		cursor: pointer;
		transition:
			opacity 0.2s,
			transform 0.2s;
	}

	.save-btn:hover:not(:disabled) {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		transform: none;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Responsive */
	@media (max-width: 480px) {
		.detection-row {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.25rem;
		}

		.preconfigured-card {
			padding: 1rem;
			gap: 0.875rem;
		}

		.preconfigured-icon {
			width: 38px;
			height: 38px;
		}

		.preconfigured-icon svg {
			width: 20px;
			height: 20px;
		}

		.preconfigured-title {
			font-size: 0.875rem;
		}

		.preconfigured-url {
			font-size: 0.75rem;
		}

		.button-group {
			flex-direction: column;
		}

		.skip-btn,
		.save-btn {
			flex: none;
		}

		.input-wrapper {
			flex-direction: column;
		}

		.use-detected-btn {
			width: 100%;
			padding: 0.625rem;
		}
	}
</style>
