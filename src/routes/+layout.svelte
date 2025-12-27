<script lang="ts">
	import '../app.css';
	import obzorarrIcon from '$lib/assets/obzorarr-icon.svg';
	import { page } from '$app/stores';
	import { Toaster } from 'svelte-sonner';
	import { loadThemeFont } from '$lib/utils/theme-fonts';

	let { children } = $props();

	/**
	 * Check if current route is a wrapped page.
	 */
	const isWrappedRoute = $derived($page.url?.pathname?.startsWith('/wrapped') ?? false);

	/**
	 * Compute the effective theme class.
	 * Uses wrappedTheme only when on /wrapped/* routes,
	 * otherwise uses uiTheme for all other pages.
	 */
	const effectiveTheme = $derived.by(() => {
		const data = $page.data as { wrappedTheme?: string; uiTheme?: string };
		if (isWrappedRoute && data.wrappedTheme) {
			return data.wrappedTheme;
		}
		return data.uiTheme ?? 'modern-minimal';
	});
	const themeClass = $derived(`theme-${effectiveTheme}`);

	/**
	 * Apply theme class and load font for the theme.
	 * Uses $effect to ensure reactivity and proper cleanup.
	 */
	$effect(() => {
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

		// Remove all existing theme classes
		document.body.classList.remove(...themeClasses);

		// Add the effective theme class
		document.body.classList.add(themeClass);

		// Add/remove wrapped route class for full-viewport theming
		if (isWrappedRoute) {
			document.body.classList.add('wrapped-route');
		} else {
			document.body.classList.remove('wrapped-route');
		}

		// Load the font for this theme (if not already loaded)
		loadThemeFont(effectiveTheme);
	});
</script>

<svelte:head>
	<link rel="icon" href={obzorarrIcon} />
	<title>Obzorarr - Year in Review</title>
</svelte:head>

{@render children()}

<Toaster position="top-right" richColors closeButton duration={4000} />
