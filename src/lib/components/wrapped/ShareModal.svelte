<script lang="ts">
	import { enhance } from '$app/forms';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import type { ShareModeType } from '$lib/sharing/types';

	/**
	 * ShareModal Component
	 *
	 * Dialog for sharing wrapped pages with copy-to-clipboard
	 * and permission-based sharing controls.
	 */

	interface ShareSettings {
		mode: ShareModeType;
		shareToken: string | null | undefined;
		canUserControl: boolean;
	}

	interface Props {
		open?: boolean;
		onOpenChange?: (open: boolean) => void;
		currentUrl: string;
		shareSettings?: ShareSettings;
		isOwner?: boolean;
		isAdmin?: boolean;
		isServerWrapped?: boolean;
	}

	let {
		open = $bindable(false),
		onOpenChange,
		currentUrl,
		shareSettings,
		isOwner = false,
		isAdmin = false,
		isServerWrapped = false
	}: Props = $props();

	// State
	let copied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | undefined;
	let isUpdating = $state(false);

	// Computed URL based on mode
	const shareUrl = $derived.by(() => {
		const origin = typeof window !== 'undefined' ? window.location.origin : '';

		if (!shareSettings) return `${origin}${currentUrl}`;

		if (shareSettings.mode === 'private-link' && shareSettings.shareToken) {
			// Replace user ID with token in URL for private-link mode
			const parts = currentUrl.split('/u/');
			if (parts.length === 2) {
				return `${origin}${parts[0]}/u/${shareSettings.shareToken}`;
			}
		}
		return `${origin}${currentUrl}`;
	});

	// Can show share mode controls
	const canControlShare = $derived(
		isOwner && (shareSettings?.canUserControl || isAdmin) && !isServerWrapped
	);

	// Available modes based on permissions
	const availableModes = $derived.by(() => {
		if (isAdmin) return ['public', 'private-oauth', 'private-link'] as const;
		if (shareSettings?.canUserControl) return ['public', 'private-oauth'] as const;
		return [] as const;
	});

	// Mode display labels
	const modeLabels: Record<ShareModeType, { label: string; description: string }> = {
		public: {
			label: 'Public',
			description: 'Anyone can view'
		},
		'private-oauth': {
			label: 'Server Members',
			description: 'Only Plex server members'
		},
		'private-link': {
			label: 'Private Link',
			description: 'Anyone with the link'
		}
	};

	async function copyUrl(): Promise<void> {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			// Fallback for older browsers
			const input = document.createElement('input');
			input.value = shareUrl;
			document.body.appendChild(input);
			input.select();
			document.execCommand('copy');
			document.body.removeChild(input);
			copied = true;
			clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		}
	}

	function handleOpenChange(value: boolean): void {
		open = value;
		onOpenChange?.(value);
	}

	// Cleanup on unmount
	$effect(() => {
		return () => {
			clearTimeout(copyTimeout);
		};
	});
</script>

<AlertDialog.Root bind:open onOpenChange={handleOpenChange}>
	<AlertDialog.Content class="share-modal">
		<AlertDialog.Header>
			<AlertDialog.Title>Share Wrapped</AlertDialog.Title>
			<AlertDialog.Description>
				{#if isServerWrapped}
					Share this server's Year in Review with others
				{:else}
					Share your Year in Review with friends and family
				{/if}
			</AlertDialog.Description>
		</AlertDialog.Header>

		<!-- Copy URL Section -->
		<div class="url-section">
			<label for="share-url" class="label">Share Link</label>
			<div class="url-row">
				<input
					id="share-url"
					type="text"
					readonly
					value={shareUrl}
					class="url-input"
					onclick={(e) => e.currentTarget.select()}
				/>
				<button
					type="button"
					class="copy-btn"
					onclick={copyUrl}
					aria-label={copied ? 'Copied!' : 'Copy link'}
				>
					{#if copied}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="icon check"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="icon"
						>
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						</svg>
					{/if}
				</button>
			</div>
			{#if copied}
				<span class="copied-feedback">Copied to clipboard!</span>
			{/if}
		</div>

		<!-- Share Mode Controls (conditional) -->
		{#if canControlShare && availableModes.length > 0}
			<div class="share-modes">
				<span class="label" id="visibility-label">Visibility</span>
				<form
					aria-labelledby="visibility-label"
					method="POST"
					action="?/updateShareMode"
					use:enhance={() => {
						isUpdating = true;
						return async ({ update }) => {
							await update();
							isUpdating = false;
						};
					}}
				>
					<div class="mode-options">
						{#each availableModes as mode}
							<label class="mode-option" class:active={shareSettings?.mode === mode}>
								<input
									type="radio"
									name="mode"
									value={mode}
									checked={shareSettings?.mode === mode}
									disabled={isUpdating}
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								/>
								<div class="mode-content">
									<span class="mode-label">{modeLabels[mode as ShareModeType].label}</span>
									<span class="mode-desc">{modeLabels[mode as ShareModeType].description}</span>
								</div>
								{#if shareSettings?.mode === mode}
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
										class="check-icon"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
								{/if}
							</label>
						{/each}
					</div>
				</form>

				<!-- Regenerate Token (admin only, private-link mode) -->
				{#if isAdmin && shareSettings?.mode === 'private-link'}
					<form
						method="POST"
						action="?/regenerateToken"
						use:enhance={() => {
							isUpdating = true;
							return async ({ update }) => {
								await update();
								isUpdating = false;
							};
						}}
						class="regenerate-form"
					>
						<button type="submit" class="btn-link" disabled={isUpdating}>
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
								<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
								<path d="M3 3v5h5" />
							</svg>
							Regenerate share link
						</button>
					</form>
				{/if}
			</div>
		{/if}

		<!-- Advanced Options Link (admin only) -->
		{#if isAdmin}
			<div class="advanced-section">
				<a href="/admin/users" class="advanced-link">
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
						<path
							d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
						/>
						<circle cx="12" cy="12" r="3" />
					</svg>
					Advanced sharing options
				</a>
			</div>
		{/if}

		<AlertDialog.Footer>
			<AlertDialog.Cancel>Close</AlertDialog.Cancel>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	:global(.share-modal) {
		max-width: 28rem !important;
	}

	.url-section {
		margin-top: 0.5rem;
		margin-bottom: 1.25rem;
	}

	.label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		margin-bottom: 0.5rem;
	}

	.url-row {
		display: flex;
		gap: 0.5rem;
	}

	.url-input {
		flex: 1;
		padding: 0.625rem 0.75rem;
		font-size: 0.875rem;
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		background-color: hsl(var(--background));
		color: hsl(var(--foreground));
		font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, monospace;
	}

	.url-input:focus {
		outline: none;
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
	}

	.copy-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		background-color: hsl(var(--background));
		color: hsl(var(--foreground));
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease;
	}

	.copy-btn:hover {
		background-color: rgba(255, 255, 255, 0.1);
		border-color: hsl(var(--primary));
	}

	.copy-btn .icon.check {
		color: #22c55e;
	}

	.copied-feedback {
		display: block;
		margin-top: 0.375rem;
		font-size: 0.75rem;
		color: #22c55e;
	}

	.share-modes {
		margin-bottom: 1.25rem;
		padding-top: 1rem;
		border-top: 1px solid hsl(var(--border));
	}

	.mode-options {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.mode-option {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease;
	}

	.mode-option:hover {
		background-color: rgba(255, 255, 255, 0.05);
	}

	.mode-option.active {
		border-color: hsl(var(--primary));
		background-color: hsl(var(--primary) / 0.08);
	}

	.mode-option input[type='radio'] {
		display: none;
	}

	.mode-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.mode-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.mode-desc {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.check-icon {
		color: hsl(var(--primary));
	}

	.regenerate-form {
		margin-top: 0.75rem;
	}

	.btn-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.375rem 0;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.15s ease;
	}

	.btn-link:hover {
		color: hsl(var(--foreground));
	}

	.btn-link:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.advanced-section {
		padding-top: 1rem;
		border-top: 1px solid hsl(var(--border));
		margin-bottom: 0.5rem;
	}

	.advanced-link {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		text-decoration: none;
		transition: color 0.15s ease;
	}

	.advanced-link:hover {
		color: hsl(var(--foreground));
	}
</style>
