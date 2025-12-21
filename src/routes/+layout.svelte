<script lang="ts">
	import '../app.css';
	import obzorarrIcon from '$lib/assets/obzorarr-icon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={obzorarrIcon} />
	<title>Obzorarr - Year in Review</title>
</svelte:head>

{@render children()}
