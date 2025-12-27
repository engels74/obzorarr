<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { animate, stagger } from 'motion';
	import OnboardingCard from '$lib/components/onboarding/OnboardingCard.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { PageData, ActionData } from './$types';

	/**
	 * Onboarding Step 1: Plex Configuration
	 *
	 * Two flows:
	 * 1. ENV configured: Show "Sign in as Admin" → verify → proceed
	 * 2. No ENV: Show "Sign in with Plex" → select server → proceed
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// OAuth state
	let isOAuthLoading = $state(false);
	let oauthError = $state<string | null>(null);
	let pollIntervalId: ReturnType<typeof setInterval> | null = null;
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	// Local auth state for immediate UI updates after OAuth
	// Bypasses SvelteKit data prop reactivity timing issues
	let localAuthState = $state<{
		isAuthenticated: boolean;
		isAdmin: boolean;
		username: string | null;
	} | null>(null);

	// Server selection state (for no-ENV flow)
	let servers = $state<
		Array<{
			name: string;
			clientIdentifier: string;
			owned: boolean;
			accessToken: string | null;
			bestConnectionUrl?: string;
			publicAddress?: string;
			connections?: Array<{ uri: string; local: boolean; relay: boolean }>;
		}>
	>([]);
	let isLoadingServers = $state(false);
	let expandedServer = $state<string | null>(null);
	let selectedServer = $state<string | null>(null);
	let selectedConnection = $state<string | null>(null);
	let isSavingServer = $state(false);
	let serverSaved = $state(false);

	// Animation refs
	let iconRef: HTMLElement | undefined = $state();
	let contentRef: HTMLElement | undefined = $state();

	// Track animated elements to avoid re-animating them
	let animatedElements = new WeakSet<Element>();

	// Icon glow animation
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

	// Stagger content animation - re-runs when content structure changes
	$effect(() => {
		if (!contentRef) return;

		// Track underlying state variables that affect DOM structure
		// When these change, new .animate-item elements may be added to the DOM
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		localAuthState?.isAuthenticated;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		localAuthState?.isAdmin;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		data.isAuthenticated;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		isLoadingServers;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		servers.length;

		// Use requestAnimationFrame to ensure DOM has updated after state change
		const rafId = requestAnimationFrame(() => {
			if (!contentRef) return;
			const items = contentRef.querySelectorAll('.animate-item');
			// Filter to only animate elements that haven't been animated yet
			const newItems = Array.from(items).filter((item) => !animatedElements.has(item));

			if (newItems.length === 0) return;

			// Mark these elements as animated before starting animation
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

	// Cleanup polling on unmount
	$effect(() => {
		return () => {
			if (pollIntervalId) clearInterval(pollIntervalId);
			if (timeoutId) clearTimeout(timeoutId);
		};
	});

	// Initialize local auth state from data if already authenticated (page refresh case)
	$effect(() => {
		if (browser && localAuthState === null && data.isAuthenticated) {
			localAuthState = {
				isAuthenticated: data.isAuthenticated,
				isAdmin: data.isAdmin,
				username: data.username ?? null
			};
		}
	});

	// Fetch servers on page load for authenticated admins (no-ENV flow)
	// This handles the case when user reloads the page while already authenticated
	$effect(() => {
		if (!browser) return;

		// Use effective states which include local auth state for immediate OAuth response
		const isAuth = localAuthState?.isAuthenticated ?? data.isAuthenticated;
		const isAdm = localAuthState?.isAdmin ?? data.isAdmin;

		// Check if we should fetch servers:
		// - No ENV config (manual server selection flow)
		// - User is authenticated as admin
		// - No servers loaded yet
		// - Not currently loading (prevent double fetches)
		const shouldFetch =
			!data.hasEnvConfig && isAuth && isAdm && servers.length === 0 && !isLoadingServers;

		if (shouldFetch) {
			fetchServers();
		}
	});

	async function fetchServers() {
		isLoadingServers = true;
		oauthError = null; // Clear previous errors
		try {
			const response = await fetch('/api/onboarding/servers');
			if (!response.ok) {
				// Handle specific error cases
				if (response.status === 401) {
					// Session expired or Plex token invalid - clear the stale session
					// and refresh auth state so the login button appears
					await fetch('/auth/logout', { method: 'POST' });
					await invalidateAll();
					throw new Error('Session expired. Please sign in again.');
				}
				const errorData = await response.json().catch(() => ({}));
				throw new Error((errorData as { message?: string }).message || 'Failed to fetch servers');
			}
			const result = await response.json();
			servers = result.servers;
		} catch (err) {
			oauthError = err instanceof Error ? err.message : 'Failed to load servers';
		} finally {
			isLoadingServers = false;
		}
	}

	async function handlePlexLogin() {
		isOAuthLoading = true;
		oauthError = null;

		try {
			// 1. Get PIN info
			const response = await fetch('/auth/plex');
			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error(errData.message || 'Failed to initiate login');
			}
			const { pinId, authUrl } = (await response.json()) as { pinId: number; authUrl: string };

			// 2. Open Plex auth in new window
			const authWindow = window.open(authUrl, 'plex-auth', 'width=600,height=700');

			// 3. Poll for completion
			pollIntervalId = setInterval(async () => {
				try {
					const pollResponse = await fetch('/auth/plex', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ pinId })
					});

					if (!pollResponse.ok) {
						const status = pollResponse.status;
						if (status === 401) {
							if (pollIntervalId) clearInterval(pollIntervalId);
							pollIntervalId = null;
							isOAuthLoading = false;
							oauthError = 'Authentication expired. Please try again.';
							return;
						}
						return;
					}

					const result = (await pollResponse.json()) as { pending: true } | { authToken: string };

					if ('authToken' in result && result.authToken) {
						if (pollIntervalId) clearInterval(pollIntervalId);
						pollIntervalId = null;
						authWindow?.close();

						// 4. Complete auth via callback endpoint
						const callbackResponse = await fetch('/auth/plex/callback', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ authToken: result.authToken })
						});

						if (!callbackResponse.ok) {
							const errData = await callbackResponse.json().catch(() => ({}));
							throw new Error((errData as { message?: string }).message || 'Login failed');
						}

						// 5. Extract user info from callback response and update local state immediately
						const callbackData = (await callbackResponse.json()) as {
							user: { id: number; plexId: number; username: string; isAdmin: boolean };
						};

						// Update local auth state immediately - triggers UI re-render
						// This bypasses SvelteKit data prop reactivity timing issues
						localAuthState = {
							isAuthenticated: true,
							isAdmin: callbackData.user.isAdmin,
							username: callbackData.user.username
						};

						// 6. Refresh page data in background (fire and forget)
						// The $effect at lines 133-153 will automatically trigger fetchServers()
						// when localAuthState changes, so no explicit call needed here
						invalidateAll();

						isOAuthLoading = false;
					}
				} catch (err) {
					if (pollIntervalId) clearInterval(pollIntervalId);
					pollIntervalId = null;
					isOAuthLoading = false;
					oauthError = err instanceof Error ? err.message : 'Login failed';
				}
			}, 2000);

			// Timeout after 5 minutes
			timeoutId = setTimeout(
				() => {
					if (pollIntervalId) {
						clearInterval(pollIntervalId);
						pollIntervalId = null;
					}
					if (isOAuthLoading) {
						isOAuthLoading = false;
						oauthError = 'Authentication timed out. Please try again.';
					}
				},
				5 * 60 * 1000
			);
		} catch (err) {
			isOAuthLoading = false;
			oauthError = err instanceof Error ? err.message : 'Login failed';
		}
	}

	function handleServerExpand(server: (typeof servers)[0]) {
		if (!server.owned) return;

		// Toggle expansion - collapse if clicking the same server
		if (expandedServer === server.clientIdentifier) {
			expandedServer = null;
		} else {
			expandedServer = server.clientIdentifier;
			selectedConnection = null;
		}
	}

	async function handleConnectionSelect(
		server: (typeof servers)[0],
		connection: { uri: string; local: boolean; relay: boolean }
	) {
		if (!server.owned) return;

		selectedServer = server.clientIdentifier;
		selectedConnection = connection.uri;
		isSavingServer = true;
		oauthError = null;

		try {
			const response = await fetch('/api/onboarding/select-server', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					serverUrl: connection.uri,
					accessToken: server.accessToken,
					serverName: server.name
				})
			});

			if (!response.ok) {
				const errData = await response.json().catch(() => ({}));
				throw new Error((errData as { message?: string }).message || 'Failed to save server');
			}

			serverSaved = true;
		} catch (err) {
			oauthError = err instanceof Error ? err.message : 'Failed to save server';
			selectedServer = null;
			selectedConnection = null;
		} finally {
			isSavingServer = false;
		}
	}

	/**
	 * Get connection type label and styling info
	 */
	function getConnectionInfo(connection: { uri: string; local: boolean; relay: boolean }): {
		label: string;
		type: 'secure' | 'local' | 'remote' | 'relay';
		description: string;
		tooltip?: string;
		isSSL: boolean;
	} {
		if (connection.uri.includes('.plex.direct')) {
			return {
				label: 'SSL',
				type: 'secure',
				description: 'Encrypted connection',
				tooltip:
					'This connection uses plex.direct with TLS/SSL encryption. Your data is securely encrypted in transit, providing protection against eavesdropping and tampering.',
				isSSL: true
			};
		}
		if (connection.relay) {
			return {
				label: 'Relay',
				type: 'relay',
				description: 'Routed through Plex servers',
				tooltip:
					'Traffic is routed through Plex relay servers. May have higher latency but works when direct connections are unavailable.',
				isSSL: false
			};
		}
		if (connection.local) {
			return {
				label: 'Local',
				type: 'local',
				description: 'Internal network connection',
				tooltip:
					'Connects directly over your local network. Fast and reliable but only works when on the same network as your server.',
				isSSL: false
			};
		}
		return {
			label: 'Remote',
			type: 'remote',
			description: 'Direct external connection',
			tooltip: 'Connects directly to your server over the internet using your public IP address.',
			isSSL: false
		};
	}

	/**
	 * Sort connections by preference: secure > remote > local > relay
	 */
	function sortConnections(
		connections: Array<{ uri: string; local: boolean; relay: boolean }>
	): Array<{ uri: string; local: boolean; relay: boolean }> {
		return [...connections].sort((a, b) => {
			const priority = (c: { uri: string; local: boolean; relay: boolean }) => {
				if (c.uri.includes('.plex.direct')) return 0;
				if (!c.local && !c.relay) return 1;
				if (c.local && !c.relay) return 2;
				return 3; // relay
			};
			return priority(a) - priority(b);
		});
	}

	// Derived states - use local auth state if available, fall back to data props
	// This ensures immediate UI updates after OAuth without waiting for SvelteKit data invalidation
	const effectiveIsAuthenticated = $derived(
		localAuthState?.isAuthenticated ?? data.isAuthenticated
	);
	const effectiveIsAdmin = $derived(localAuthState?.isAdmin ?? data.isAdmin);
	const effectiveUsername = $derived(localAuthState?.username ?? data.username);

	const showLoginButton = $derived(!effectiveIsAuthenticated);
	const showVerifyButton = $derived(data.hasEnvConfig && effectiveIsAuthenticated);
	const showServerSelector = $derived(
		!data.hasEnvConfig && effectiveIsAuthenticated && effectiveIsAdmin
	);
	const isNonAdminUser = $derived(effectiveIsAuthenticated && !effectiveIsAdmin);
	const ownedServers = $derived(servers.filter((s) => s.owned));
	const canContinue = $derived(
		(data.hasEnvConfig && data.canProceed) || (!data.hasEnvConfig && serverSaved)
	);

	// Format server URL for display
	function formatServerUrl(url: string | null): string {
		if (!url) return '';
		try {
			const parsed = new URL(url);
			return `${parsed.hostname}:${parsed.port || '32400'}`;
		} catch {
			return url;
		}
	}
</script>

<OnboardingCard
	title="Connect Your Plex Server"
	subtitle="Link your Plex Media Server to unlock your personalized viewing journey"
>
	<div class="plex-content" bind:this={contentRef}>
		<!-- Plex Icon -->
		<div class="plex-icon-wrapper animate-item" bind:this={iconRef}>
			<div class="plex-icon-glow"></div>
			<div class="plex-icon">
				<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
					<defs>
						<linearGradient id="plex-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
							<stop offset="0%" stop-color="#E5A00D" />
							<stop offset="100%" stop-color="#CC8400" />
						</linearGradient>
						<filter id="plex-shadow" x="-50%" y="-50%" width="200%" height="200%">
							<feDropShadow
								dx="0"
								dy="2"
								stdDeviation="3"
								flood-color="#E5A00D"
								flood-opacity="0.4"
							/>
						</filter>
					</defs>
					<rect
						x="4"
						y="4"
						width="40"
						height="40"
						rx="8"
						fill="url(#plex-gradient)"
						filter="url(#plex-shadow)"
					/>
					<path d="M18 14L34 24L18 34V14Z" fill="white" fill-opacity="0.95" />
				</svg>
			</div>
		</div>

		<!-- Pre-configured flow -->
		{#if data.hasEnvConfig}
			<div class="preconfigured-card animate-item">
				<div class="preconfigured-icon">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
						<rect x="2" y="3" width="20" height="14" rx="2" />
						<line x1="8" y1="21" x2="16" y2="21" />
						<line x1="12" y1="17" x2="12" y2="21" />
					</svg>
				</div>
				<div class="preconfigured-info">
					<div class="preconfigured-header">
						<span class="preconfigured-title">Plex Media Server</span>
						<span class="preconfigured-badge">
							<svg
								class="lock-icon"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
								<path d="M7 11V7a5 5 0 0 1 10 0v4" />
							</svg>
							ENV
						</span>
					</div>
					{#if data.plexServerName}
						<span class="preconfigured-server-name">{data.plexServerName}</span>
					{/if}
					{#if data.plexServerUrl}
						<span class="preconfigured-url">{formatServerUrl(data.plexServerUrl)}</span>
					{/if}
				</div>
				<div class="preconfigured-check">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</div>
			</div>

			{#if showLoginButton}
				<div class="action-section animate-item">
					<p class="instruction">Sign in with your Plex account to verify admin access</p>
					<button
						type="button"
						class="plex-button"
						onclick={handlePlexLogin}
						disabled={isOAuthLoading}
					>
						{#if isOAuthLoading}
							<span class="button-spinner"></span>
							<span>Connecting to Plex...</span>
						{:else}
							<svg class="plex-logo" viewBox="0 0 24 24" fill="currentColor">
								<path d="M6 4l12 8-12 8V4z" />
							</svg>
							<span>Sign in with Plex</span>
						{/if}
					</button>
				</div>
			{:else if isNonAdminUser}
				<div class="error-card animate-item">
					<div class="error-icon">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
					</div>
					<div class="error-content">
						<p class="error-title">Admin Access Required</p>
						<p class="error-message">
							Only the Plex server owner can configure Obzorarr. Please sign in with the server
							owner account.
						</p>
					</div>
				</div>
			{:else}
				<div class="success-card animate-item">
					<div class="success-icon">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<path d="M20 6L9 17l-5-5" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					</div>
					<div class="success-content">
						<p class="success-title">Signed in as {effectiveUsername}</p>
						<p class="success-message">Admin access verified. Ready to continue.</p>
					</div>
				</div>
			{/if}
		{:else}
			<!-- Manual configuration flow -->
			{#if showLoginButton}
				<div class="action-section animate-item">
					<p class="instruction">Sign in with Plex to connect your server</p>
					<button
						type="button"
						class="plex-button"
						onclick={handlePlexLogin}
						disabled={isOAuthLoading}
					>
						{#if isOAuthLoading}
							<span class="button-spinner"></span>
							<span>Connecting to Plex...</span>
						{:else}
							<svg class="plex-logo" viewBox="0 0 24 24" fill="currentColor">
								<path d="M6 4l12 8-12 8V4z" />
							</svg>
							<span>Sign in with Plex</span>
						{/if}
					</button>
				</div>
			{:else if isNonAdminUser}
				<div class="error-card animate-item">
					<div class="error-icon">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<circle cx="12" cy="12" r="10" />
							<line x1="12" y1="8" x2="12" y2="12" />
							<line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
					</div>
					<div class="error-content">
						<p class="error-title">Server Owner Required</p>
						<p class="error-message">
							You must be a server owner to configure Obzorarr. Please sign in with an account that
							owns a Plex server.
						</p>
					</div>
				</div>
			{:else if showServerSelector}
				<div class="server-section animate-item">
					<p class="instruction">Select the Plex server you want to connect</p>

					{#if isLoadingServers}
						<div class="servers-loading">
							<span class="loading-spinner"></span>
							<span>Loading your servers...</span>
						</div>
					{:else if ownedServers.length === 0}
						<div class="no-servers">
							<p>No servers found where you are the owner.</p>
							<p class="no-servers-hint">You must be the owner of a Plex server to use Obzorarr.</p>
						</div>
					{:else}
						<div class="server-list">
							{#each ownedServers as server (server.clientIdentifier)}
								{@const isExpanded = expandedServer === server.clientIdentifier}
								{@const isSelected = selectedServer === server.clientIdentifier}
								{@const connections = server.connections ? sortConnections(server.connections) : []}
								<div class="server-item" class:expanded={isExpanded}>
									<button
										type="button"
										class="server-card"
										class:expanded={isExpanded}
										class:selected={isSelected && serverSaved}
										onclick={() => handleServerExpand(server)}
										disabled={isSavingServer}
									>
										<div class="server-icon">
											<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
												<rect x="2" y="3" width="20" height="14" rx="2" />
												<line x1="8" y1="21" x2="16" y2="21" />
												<line x1="12" y1="17" x2="12" y2="21" />
											</svg>
										</div>
										<div class="server-info">
											<span class="server-name">{server.name}</span>
											<span class="server-badge owner">Owner</span>
										</div>
										{#if isSelected && serverSaved}
											<div class="server-check">
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
													<path
														d="M20 6L9 17l-5-5"
														stroke-linecap="round"
														stroke-linejoin="round"
													/>
												</svg>
											</div>
										{:else}
											<div class="server-expand" class:rotated={isExpanded}>
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round" />
												</svg>
											</div>
										{/if}
									</button>

									{#if isExpanded && connections.length > 0}
										<div class="connections-panel">
											<p class="connections-label">Select a connection</p>
											<Tooltip.Provider>
												<div class="connections-list">
													{#each connections as connection (connection.uri)}
														{@const info = getConnectionInfo(connection)}
														{@const isConnSelected = selectedConnection === connection.uri}
														<button
															type="button"
															class="connection-card"
															class:selected={isConnSelected}
															class:saving={isSavingServer && isConnSelected}
															class:ssl={info.isSSL}
															onclick={() => handleConnectionSelect(server, connection)}
															disabled={isSavingServer}
														>
															<div class="connection-info">
																<div class="connection-header">
																	<Tooltip.Root>
																		<Tooltip.Trigger>
																			{#snippet child({ props })}
																				<span
																					{...props}
																					class="connection-badge {info.type}"
																				>
																					{#if info.isSSL}
																						<svg
																							class="ssl-lock-icon"
																							viewBox="0 0 24 24"
																							fill="none"
																							stroke="currentColor"
																							stroke-width="2.5"
																							aria-hidden="true"
																						>
																							<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
																							<path d="M7 11V7a5 5 0 0 1 10 0v4" />
																						</svg>
																					{/if}
																					{info.label}
																				</span>
																			{/snippet}
																		</Tooltip.Trigger>
																		<Tooltip.Content
																			side="top"
																			class="connection-tooltip"
																			sideOffset={8}
																		>
																			<div class="tooltip-inner">
																				{#if info.isSSL}
																					<div class="tooltip-header ssl">
																						<svg
																							class="tooltip-icon"
																							viewBox="0 0 24 24"
																							fill="none"
																							stroke="currentColor"
																							stroke-width="2"
																						>
																							<path
																								d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
																								fill="currentColor"
																								fill-opacity="0.2"
																							/>
																							<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
																						</svg>
																						<strong>Secure Connection</strong>
																					</div>
																				{:else}
																					<strong class="tooltip-title">{info.label} Connection</strong
																					>
																				{/if}
																				<p class="tooltip-text">{info.tooltip}</p>
																			</div>
																		</Tooltip.Content>
																	</Tooltip.Root>
																	<span class="connection-desc">{info.description}</span>
																</div>
																<span class="connection-uri">{formatServerUrl(connection.uri)}</span>
															</div>
															{#if isConnSelected}
																<div class="connection-check">
																	{#if isSavingServer}
																		<span class="check-spinner"></span>
																	{:else}
																		<svg
																			viewBox="0 0 24 24"
																			fill="none"
																			stroke="currentColor"
																			stroke-width="3"
																		>
																			<path
																				d="M20 6L9 17l-5-5"
																				stroke-linecap="round"
																				stroke-linejoin="round"
																			/>
																		</svg>
																	{/if}
																</div>
															{/if}
														</button>
													{/each}
												</div>
											</Tooltip.Provider>
										</div>
									{:else if isExpanded}
										<div class="connections-panel">
											<p class="no-connections">No connections available for this server.</p>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/if}

		<!-- Error display -->
		{#if oauthError || form?.error}
			<div class="error-banner animate-item">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<circle cx="12" cy="12" r="10" />
					<line x1="15" y1="9" x2="9" y2="15" />
					<line x1="9" y1="9" x2="15" y2="15" />
				</svg>
				<span>{oauthError || form?.error}</span>
			</div>
		{/if}
	</div>

	{#snippet footer()}
		{#if data.hasEnvConfig && data.canProceed}
			<form method="POST" action="?/verifyAdmin" use:enhance>
				<button type="submit" class="continue-button">
					<span>Continue</span>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			</form>
		{:else if !data.hasEnvConfig && serverSaved}
			<form method="POST" action="?/continueAfterServerSelection" use:enhance>
				<button type="submit" class="continue-button">
					<span>Continue</span>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
						<path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</button>
			</form>
		{:else}
			<button type="button" class="continue-button" disabled>
				<span>Continue</span>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
					<path d="M5 12h14M12 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</button>
		{/if}
	{/snippet}
</OnboardingCard>

<style>
	.plex-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.animate-item {
		opacity: 0;
	}

	/* Plex Icon */
	.plex-icon-wrapper {
		position: relative;
		width: 72px;
		height: 72px;
	}

	.plex-icon-glow {
		position: absolute;
		inset: -8px;
		background: radial-gradient(circle, rgba(229, 160, 13, 0.4) 0%, transparent 70%);
		border-radius: 50%;
		animation: icon-pulse 3s ease-in-out infinite;
	}

	@keyframes icon-pulse {
		0%,
		100% {
			opacity: 0.6;
			transform: scale(1);
		}
		50% {
			opacity: 0.8;
			transform: scale(1.05);
		}
	}

	.plex-icon {
		position: relative;
		width: 100%;
		height: 100%;
	}

	.plex-icon svg {
		width: 100%;
		height: 100%;
	}

	/* Pre-configured Server Card */
	.preconfigured-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.125rem 1.25rem;
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.02) 100%);
		border: 1px solid rgba(34, 197, 94, 0.25);
		border-radius: 14px;
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

	.preconfigured-server-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.7);
	}

	.preconfigured-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.5rem;
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: rgba(34, 197, 94, 0.2);
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

	/* Action Section */
	.action-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		width: 100%;
	}

	.instruction {
		margin: 0;
		font-size: 0.95rem;
		color: rgba(255, 255, 255, 0.6);
		text-align: center;
	}

	/* Plex Login Button */
	.plex-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.875rem 2rem;
		min-width: 220px;
		font-size: 1rem;
		font-weight: 600;
		color: hsl(30, 20%, 10%);
		background: linear-gradient(135deg, #e5a00d 0%, #cc8400 100%);
		border: none;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
		box-shadow:
			0 4px 16px rgba(229, 160, 13, 0.35),
			0 2px 4px rgba(0, 0, 0, 0.2),
			inset 0 1px 0 rgba(255, 255, 255, 0.25);
	}

	.plex-button:hover:not(:disabled) {
		transform: translateY(-2px);
		box-shadow:
			0 6px 24px rgba(229, 160, 13, 0.45),
			0 4px 8px rgba(0, 0, 0, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
	}

	.plex-button:active:not(:disabled) {
		transform: translateY(0);
	}

	.plex-button:disabled {
		opacity: 0.85;
		cursor: not-allowed;
	}

	.plex-logo {
		width: 18px;
		height: 18px;
	}

	.button-spinner {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(0, 0, 0, 0.2);
		border-top-color: rgba(0, 0, 0, 0.7);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	/* Success Card */
	.success-card {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem 1.25rem;
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.25);
		border-radius: 12px;
		width: 100%;
	}

	.success-icon {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		color: hsl(142, 71%, 55%);
	}

	.success-icon svg {
		width: 100%;
		height: 100%;
	}

	.success-content {
		flex: 1;
	}

	.success-title {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
	}

	.success-message {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.55);
	}

	/* Error Card */
	.error-card {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem 1.25rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.25);
		border-radius: 12px;
		width: 100%;
	}

	.error-icon {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		color: hsl(0, 84%, 60%);
	}

	.error-icon svg {
		width: 100%;
		height: 100%;
	}

	.error-content {
		flex: 1;
	}

	.error-title {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
	}

	.error-message {
		margin: 0.25rem 0 0;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.55);
		line-height: 1.5;
	}

	/* Server Section */
	.server-section {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.servers-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 2rem;
		color: rgba(255, 255, 255, 0.6);
		font-size: 0.9rem;
	}

	.loading-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-top-color: hsl(35, 100%, 50%);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.no-servers {
		text-align: center;
		padding: 1.5rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.no-servers p {
		margin: 0;
	}

	.no-servers-hint {
		margin-top: 0.5rem !important;
		font-size: 0.85rem;
		opacity: 0.7;
	}

	.server-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.server-item {
		display: flex;
		flex-direction: column;
	}

	.server-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		width: 100%;
	}

	.server-card.expanded {
		border-radius: 12px 12px 0 0;
		border-bottom-color: transparent;
	}

	.server-card:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.server-card.expanded:hover:not(:disabled) {
		border-bottom-color: transparent;
	}

	.server-card.selected {
		background: rgba(229, 160, 13, 0.1);
		border-color: rgba(229, 160, 13, 0.4);
		box-shadow: 0 0 0 1px rgba(229, 160, 13, 0.2);
	}

	.server-card:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.server-icon {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 10px;
		color: rgba(255, 255, 255, 0.7);
	}

	.server-icon svg {
		width: 22px;
		height: 22px;
	}

	.server-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.server-name {
		font-size: 0.95rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
	}

	.server-badge {
		display: inline-flex;
		align-items: center;
		width: fit-content;
		padding: 0.2rem 0.5rem;
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border-radius: 4px;
	}

	.server-badge.owner {
		background: rgba(229, 160, 13, 0.15);
		color: hsl(40, 90%, 55%);
	}

	.server-check {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		color: hsl(35, 100%, 50%);
	}

	.server-check svg {
		width: 100%;
		height: 100%;
	}

	.server-expand {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		color: rgba(255, 255, 255, 0.4);
		transition: transform 0.2s ease;
	}

	.server-expand.rotated {
		transform: rotate(180deg);
	}

	.server-expand svg {
		width: 100%;
		height: 100%;
	}

	.check-spinner {
		display: block;
		width: 20px;
		height: 20px;
		border: 2px solid rgba(229, 160, 13, 0.3);
		border-top-color: hsl(35, 100%, 50%);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	/* Connections Panel */
	.connections-panel {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-top: none;
		border-radius: 0 0 12px 12px;
		padding: 1rem;
	}

	.connections-label {
		margin: 0 0 0.75rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.connections-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.connection-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		width: 100%;
	}

	.connection-card:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.1);
	}

	.connection-card.selected {
		background: rgba(34, 197, 94, 0.1);
		border-color: rgba(34, 197, 94, 0.4);
	}

	.connection-card:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.connection-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		min-width: 0;
	}

	.connection-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.connection-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.15rem 0.4rem;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		border-radius: 4px;
		cursor: help;
		transition: all 0.15s ease;
	}

	.connection-badge:hover {
		filter: brightness(1.15);
	}

	.connection-badge.secure {
		background: linear-gradient(
			135deg,
			rgba(34, 197, 94, 0.2) 0%,
			rgba(16, 185, 129, 0.15) 100%
		);
		color: hsl(142, 71%, 55%);
		border: 1px solid rgba(34, 197, 94, 0.3);
		box-shadow:
			0 0 8px rgba(34, 197, 94, 0.15),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}

	.connection-badge.secure:hover {
		box-shadow:
			0 0 12px rgba(34, 197, 94, 0.25),
			inset 0 1px 0 rgba(255, 255, 255, 0.15);
	}

	.ssl-lock-icon {
		width: 10px;
		height: 10px;
		flex-shrink: 0;
	}

	.connection-badge.local {
		background: rgba(59, 130, 246, 0.15);
		color: hsl(217, 91%, 60%);
	}

	.connection-badge.remote {
		background: rgba(168, 85, 247, 0.15);
		color: hsl(271, 91%, 65%);
	}

	.connection-badge.relay {
		background: rgba(251, 191, 36, 0.15);
		color: hsl(43, 96%, 56%);
	}

	.connection-desc {
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.45);
	}

	.connection-uri {
		font-size: 0.8rem;
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
		color: rgba(255, 255, 255, 0.6);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.connection-check {
		flex-shrink: 0;
		width: 20px;
		height: 20px;
		color: hsl(142, 71%, 55%);
	}

	.connection-check svg {
		width: 100%;
		height: 100%;
	}

	.no-connections {
		margin: 0;
		padding: 0.5rem;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.5);
		text-align: center;
	}

	/* Error Banner */
	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 10px;
		width: 100%;
		font-size: 0.875rem;
		color: hsl(0, 84%, 70%);
	}

	.error-banner svg {
		flex-shrink: 0;
		width: 18px;
		height: 18px;
	}

	/* Continue Button */
	.continue-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: hsl(25, 20%, 10%);
		background: linear-gradient(135deg, hsl(35, 100%, 55%) 0%, hsl(25, 100%, 50%) 100%);
		border: none;
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
		box-shadow:
			0 2px 12px rgba(255, 160, 50, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
	}

	.continue-button:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow:
			0 4px 16px rgba(255, 160, 50, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.25);
	}

	.continue-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}

	.continue-button svg {
		width: 18px;
		height: 18px;
	}

	/* SSL Connection Card Enhancement */
	.connection-card.ssl {
		background: linear-gradient(
			135deg,
			rgba(34, 197, 94, 0.06) 0%,
			rgba(255, 255, 255, 0.03) 100%
		);
		border-color: rgba(34, 197, 94, 0.15);
	}

	.connection-card.ssl:hover:not(:disabled) {
		background: linear-gradient(
			135deg,
			rgba(34, 197, 94, 0.1) 0%,
			rgba(255, 255, 255, 0.06) 100%
		);
		border-color: rgba(34, 197, 94, 0.25);
	}

	.connection-card.ssl.selected {
		background: rgba(34, 197, 94, 0.12);
		border-color: rgba(34, 197, 94, 0.5);
		box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.2);
	}

	/* Tooltip Styling */
	:global(.connection-tooltip) {
		background: rgba(15, 23, 42, 0.95) !important;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.1) !important;
		border-radius: 10px !important;
		padding: 0 !important;
		max-width: 280px;
		box-shadow:
			0 8px 32px rgba(0, 0, 0, 0.4),
			0 2px 8px rgba(0, 0, 0, 0.2) !important;
	}

	.tooltip-inner {
		padding: 0.75rem 1rem;
	}

	.tooltip-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.tooltip-header.ssl {
		color: hsl(142, 71%, 55%);
	}

	.tooltip-header strong {
		font-size: 0.85rem;
		font-weight: 600;
	}

	.tooltip-icon {
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	.tooltip-title {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.95);
		margin-bottom: 0.375rem;
	}

	.tooltip-text {
		margin: 0;
		font-size: 0.8rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.7);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Responsive */
	@media (max-width: 480px) {
		.plex-button {
			width: 100%;
			min-width: unset;
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

		.preconfigured-server-name {
			font-size: 0.8rem;
		}

		.preconfigured-url {
			font-size: 0.75rem;
		}

		.server-card {
			padding: 0.875rem 1rem;
		}

		.server-icon {
			width: 36px;
			height: 36px;
		}

		.server-icon svg {
			width: 18px;
			height: 18px;
		}

		.connections-panel {
			padding: 0.75rem;
		}

		.connection-card {
			padding: 0.625rem 0.75rem;
		}

		.connection-badge {
			font-size: 0.6rem;
		}

		.connection-desc {
			font-size: 0.7rem;
		}

		.connection-uri {
			font-size: 0.75rem;
		}
	}
</style>
