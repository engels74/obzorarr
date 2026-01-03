<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { LayoutData } from './$types';
	import type { Snippet, Component } from 'svelte';
	import Logo from '$lib/components/Logo.svelte';
	import CsrfWarningBanner from '$lib/components/security/CsrfWarningBanner.svelte';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Gift from '@lucide/svelte/icons/gift';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Users from '@lucide/svelte/icons/users';
	import FileText from '@lucide/svelte/icons/file-text';
	import Settings from '@lucide/svelte/icons/settings';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import LogOut from '@lucide/svelte/icons/log-out';
	import User from '@lucide/svelte/icons/user';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	/**
	 * Admin Layout
	 *
	 * Provides a consistent wrapper for all admin pages with:
	 * - Sidebar navigation
	 * - Admin user info
	 * - Modern command center styling
	 */

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();

	// Navigation items with Lucide icon components
	const navItems: Array<{ href: string; label: string; icon: Component }> = [
		{ href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
		{ href: '/admin/wrapped', label: 'Wrapped', icon: Gift },
		{ href: '/admin/sync', label: 'Sync', icon: RefreshCw },
		{ href: '/admin/users', label: 'Users', icon: Users },
		{ href: '/admin/logs', label: 'Logs', icon: FileText },
		{ href: '/admin/settings', label: 'Settings', icon: Settings }
	];

	// Determine if a nav item is active
	const isActive = $derived((href: string) => {
		const currentPath = $page.url.pathname;
		// Exact match for dashboard, prefix match for others
		if (href === '/admin') {
			return currentPath === '/admin';
		}
		return currentPath.startsWith(href);
	});

	// Mobile sidebar state
	let sidebarOpen = $state(false);

	// CSRF warning state - derived from data with local override for immediate dismiss
	let locallyDismissed = $state(false);
	let showCsrfWarning = $derived(data.csrfWarning.show && !locallyDismissed);

	// Reset local dismissed state when server re-enables the warning
	$effect(() => {
		if (data.csrfWarning.show) {
			locallyDismissed = false;
		}
	});

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function closeSidebar() {
		sidebarOpen = false;
	}

	function handleCsrfWarningDismissed() {
		locallyDismissed = true;
		invalidateAll();
	}
</script>

<div class="admin-layout">
	<!-- Mobile header -->
	<header class="mobile-header">
		<button
			type="button"
			class="menu-button"
			onclick={toggleSidebar}
			aria-label="Toggle navigation"
		>
			{#if sidebarOpen}
				<X class="menu-icon" />
			{:else}
				<Menu class="menu-icon" />
			{/if}
		</button>
		<div class="mobile-branding">
			<Logo size="sm" />
			<h1 class="mobile-title">Admin</h1>
		</div>
	</header>

	<!-- Sidebar overlay for mobile -->
	{#if sidebarOpen}
		<div
			class="sidebar-overlay"
			onclick={closeSidebar}
			onkeydown={(e) => e.key === 'Escape' && closeSidebar()}
			role="button"
			tabindex="-1"
			aria-label="Close sidebar"
		></div>
	{/if}

	<!-- Sidebar -->
	<aside class="sidebar" class:open={sidebarOpen}>
		<div class="sidebar-header">
			<div class="sidebar-branding">
				<Logo size="md" />
				<div class="sidebar-text">
					<h2 class="sidebar-title">Obzorarr</h2>
					<span class="sidebar-subtitle">Admin Panel</span>
				</div>
			</div>
		</div>

		<nav class="sidebar-nav" aria-label="Admin navigation">
			<ul class="nav-list">
				{#each navItems as item (item.href)}
					{@const active = isActive(item.href)}
					<li>
						<a href={item.href} class="nav-link" class:active onclick={closeSidebar}>
							<span class="nav-icon-wrap" class:active>
								<item.icon class="nav-icon" />
							</span>
							<span class="nav-label">{item.label}</span>
							{#if active}
								<ChevronRight class="nav-indicator" />
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="sidebar-footer">
			<div class="user-card">
				<div class="user-avatar">
					<User class="user-avatar-icon" />
				</div>
				<div class="user-info">
					<span class="user-name">{data.adminUser.username}</span>
					<span class="user-role">Administrator</span>
				</div>
			</div>
			<form method="POST" action="/auth/logout" use:enhance>
				<button type="submit" class="logout-button">
					<LogOut class="logout-icon" />
					<span>Logout</span>
				</button>
			</form>
		</div>
	</aside>

	<!-- Main content -->
	<main class="main-content">
		{#if showCsrfWarning}
			<CsrfWarningBanner onDismiss={handleCsrfWarningDismissed} />
		{/if}
		{@render children()}
	</main>
</div>

<style>
	.admin-layout {
		display: flex;
		min-height: 100vh;
		background: hsl(var(--background));
	}

	/* Mobile header */
	.mobile-header {
		display: none;
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		height: 56px;
		background: hsl(var(--card) / 0.95);
		backdrop-filter: blur(12px);
		border-bottom: 1px solid hsl(var(--border));
		padding: 0 1rem;
		align-items: center;
		gap: 1rem;
		z-index: 40;
	}

	.menu-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: transparent;
		border: none;
		color: hsl(var(--foreground));
		cursor: pointer;
		border-radius: 0.5rem;
		transition: all 0.2s ease;
	}

	.menu-button:hover {
		background: hsl(var(--muted));
	}

	.menu-button :global(.menu-icon) {
		width: 1.25rem;
		height: 1.25rem;
	}

	.mobile-branding {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.mobile-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--primary));
		margin: 0;
	}

	/* Sidebar overlay */
	.sidebar-overlay {
		display: none;
		position: fixed;
		inset: 0;
		background: hsl(0 0% 0% / 0.6);
		backdrop-filter: blur(4px);
		z-index: 45;
	}

	/* Sidebar */
	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: 260px;
		background: hsl(var(--card));
		border-right: 1px solid hsl(var(--border));
		display: flex;
		flex-direction: column;
		z-index: 50;
	}

	.sidebar-header {
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}

	.sidebar-branding {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.sidebar-text {
		display: flex;
		flex-direction: column;
	}

	.sidebar-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: hsl(var(--primary));
		margin: 0;
		line-height: 1.2;
		letter-spacing: -0.01em;
	}

	.sidebar-subtitle {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.08em;
		margin-top: 0.125rem;
	}

	.sidebar-nav {
		flex: 1;
		padding: 1rem 0.75rem;
		overflow-y: auto;
	}

	.nav-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.875rem;
		color: hsl(var(--muted-foreground));
		text-decoration: none;
		font-weight: 500;
		border-radius: 0.5rem;
		transition: all 0.2s ease;
		position: relative;
	}

	.nav-link:hover {
		background: hsl(var(--muted) / 0.5);
		color: hsl(var(--foreground));
	}

	.nav-link.active {
		background: hsl(var(--primary) / 0.12);
		color: hsl(var(--primary));
	}

	.nav-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.375rem;
		background: hsl(var(--muted) / 0.5);
		transition: all 0.2s ease;
	}

	.nav-link:hover .nav-icon-wrap {
		background: hsl(var(--muted));
	}

	.nav-icon-wrap.active {
		background: hsl(var(--primary) / 0.15);
	}

	.nav-link :global(.nav-icon) {
		width: 1rem;
		height: 1rem;
		transition: all 0.2s ease;
	}

	.nav-link.active :global(.nav-icon) {
		color: hsl(var(--primary));
	}

	.nav-label {
		font-size: 0.875rem;
		flex: 1;
	}

	.nav-link :global(.nav-indicator) {
		width: 1rem;
		height: 1rem;
		color: hsl(var(--primary));
		opacity: 0;
		transform: translateX(-4px);
		transition: all 0.2s ease;
	}

	.nav-link.active :global(.nav-indicator) {
		opacity: 1;
		transform: translateX(0);
	}

	.sidebar-footer {
		padding: 1rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.user-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: hsl(var(--muted) / 0.3);
		border-radius: 0.5rem;
		border: 1px solid hsl(var(--border) / 0.5);
	}

	.user-avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.8) 100%);
		border-radius: 0.5rem;
		flex-shrink: 0;
	}

	.user-avatar :global(.user-avatar-icon) {
		width: 1.125rem;
		height: 1.125rem;
		color: hsl(var(--primary-foreground));
	}

	.user-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.user-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user-role {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.logout-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.3);
		color: hsl(var(--muted-foreground));
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.logout-button:hover {
		background: hsl(var(--destructive) / 0.15);
		color: hsl(var(--destructive));
		border-color: hsl(var(--destructive) / 0.3);
	}

	.logout-button :global(.logout-icon) {
		width: 0.875rem;
		height: 0.875rem;
	}

	/* Main content */
	.main-content {
		flex: 1;
		margin-left: 260px;
		min-height: 100vh;
	}

	/* Responsive styles */
	@media (max-width: 768px) {
		.mobile-header {
			display: flex;
		}

		.sidebar-overlay {
			display: block;
		}

		.sidebar {
			transform: translateX(-100%);
			transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.sidebar.open {
			transform: translateX(0);
		}

		.main-content {
			margin-left: 0;
			padding-top: 56px;
		}
	}
</style>
