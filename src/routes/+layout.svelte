<script lang="ts">
	import '../app.css';
	import { Toaster } from 'svelte-sonner';
	import { page } from '$app/stores';
	import obzorarrIcon from '$lib/assets/obzorarr-icon.svg';
	import { loadThemeFont } from '$lib/utils/theme-fonts';

	let { children } = $props();

	const isWrappedRoute = $derived($page.url?.pathname?.startsWith('/wrapped') ?? false);

	const effectiveTheme = $derived.by(() => {
		const data = $page.data as { wrappedTheme?: string; uiTheme?: string };
		if (isWrappedRoute && data.wrappedTheme) {
			return data.wrappedTheme;
		}
		return data.uiTheme ?? 'modern-minimal';
	});
	const themeClass = $derived(`theme-${effectiveTheme}`);

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
