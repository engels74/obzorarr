<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import Logo from '$lib/components/Logo.svelte';

	/**
	 * User Dashboard Layout
	 *
	 * Provides a consistent wrapper for user dashboard pages with:
	 * - Sidebar navigation
	 * - User info
	 * - Links to wrapped presentations
	 */

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();

	// Navigation items - simplified since dashboard shows wrapped cards prominently
	const navItems = $derived([{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' }]);

	// Determine if a nav item is active
	const isActive = $derived((href: string) => {
		const currentPath = $page.url.pathname;
		if (href === '/dashboard') {
			return currentPath === '/dashboard';
		}
		return currentPath.startsWith(href);
	});

	// Mobile sidebar state
	let sidebarOpen = $state(false);

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function closeSidebar() {
		sidebarOpen = false;
	}
</script>

<div class="dashboard-layout">
	<!-- Mobile header -->
	<header class="mobile-header">
		<button
			type="button"
			class="menu-button"
			onclick={toggleSidebar}
			aria-label="Toggle navigation"
		>
			<span class="menu-icon">&#9776;</span>
		</button>
		<div class="mobile-branding">
			<Logo size="sm" />
			<h1 class="mobile-title">Obzorarr</h1>
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
					<span class="sidebar-subtitle">Your Wrapped</span>
				</div>
			</div>
		</div>

		<nav class="sidebar-nav" aria-label="Dashboard navigation">
			<ul class="nav-list">
				{#each navItems as item (item.href)}
					<li>
						<a
							href={item.href}
							class="nav-link"
							class:active={isActive(item.href)}
							onclick={closeSidebar}
						>
							<span class="nav-icon" aria-hidden="true">
								{#if item.icon === 'dashboard'}
									&#9632;
								{/if}
							</span>
							<span class="nav-label">{item.label}</span>
						</a>
					</li>
				{/each}
			</ul>
		</nav>

		<div class="sidebar-footer">
			<div class="user-info">
				<span class="user-avatar">&#9787;</span>
				<span class="user-name">{data.user.username}</span>
			</div>
			<form method="POST" action="/auth/logout" use:enhance>
				<button type="submit" class="logout-button">Logout</button>
			</form>
		</div>
	</aside>

	<!-- Main content -->
	<main class="main-content">
		{@render children()}
	</main>
</div>

<style>
	.dashboard-layout {
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
		background: hsl(var(--card));
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
		font-size: 1.5rem;
		cursor: pointer;
		border-radius: var(--radius);
	}

	.menu-button:hover {
		background: hsl(var(--muted));
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
		background: rgba(0, 0, 0, 0.5);
		z-index: 45;
	}

	/* Sidebar */
	.sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: 250px;
		background: hsl(var(--card));
		border-right: 1px solid hsl(var(--border));
		display: flex;
		flex-direction: column;
		z-index: 50;
	}

	.sidebar-header {
		padding: 1.5rem;
		border-bottom: 1px solid hsl(var(--border));
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
	}

	.sidebar-subtitle {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.sidebar-nav {
		flex: 1;
		padding: 1rem 0;
		overflow-y: auto;
	}

	.nav-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem;
		color: hsl(var(--foreground));
		text-decoration: none;
		font-weight: 500;
		transition: all 0.15s ease;
	}

	.nav-link:hover {
		background: hsl(var(--muted));
	}

	.nav-link.active {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
		border-right: 3px solid hsl(var(--primary));
	}

	.nav-icon {
		font-size: 1.25rem;
		width: 1.5rem;
		text-align: center;
	}

	.nav-label {
		font-size: 0.875rem;
	}

	.sidebar-footer {
		padding: 1rem 1.5rem;
		border-top: 1px solid hsl(var(--border));
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.user-avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-radius: 50%;
		font-size: 1rem;
	}

	.user-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.logout-button {
		width: 100%;
		padding: 0.5rem;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.logout-button:hover {
		background: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
		border-color: hsl(var(--destructive));
	}

	/* Main content */
	.main-content {
		flex: 1;
		margin-left: 250px;
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
			transition: transform 0.3s ease;
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
