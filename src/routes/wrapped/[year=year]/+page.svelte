<script lang="ts">
import { browser } from '$app/environment';
import { afterNavigate, goto, replaceState } from '$app/navigation';
import Logo from '$lib/components/Logo.svelte';
import { createServerContext } from '$lib/components/slides/messaging-context';
import {
	ModeToggle,
	ScrollMode,
	ShareModal,
	StoryMode,
	SummaryPage,
	YearNavigation
} from '$lib/components/wrapped';
import { parseSlideHash } from '$lib/utils/slide-hash';
import type { PageProps } from './$types';

let { data }: PageProps = $props();

const messagingContext = $derived(createServerContext(data.serverName));

type ViewMode = 'story' | 'scroll';
let viewMode = $state<ViewMode>('story');

// Read the initial slide index from the URL hash. During SSR `browser` is
// false, so this serializes 0; the real seeding happens once in afterNavigate
// (client-only) below, before StoryMode mounts and before the hash-sync effect
// is armed.
function readInitialSlideIndex(): number {
	return browser ? parseSlideHash(window.location.hash, data.slides.length) : 0;
}

let currentSlideIndex = $state(readInitialSlideIndex());

let showSummary = $state(false);

let showShareModal = $state(false);

let storyKey = $state(0);

// SvelteKit's replaceState throws "replaceState() called before router was
// initialized" if invoked before the first afterNavigate tick. Gate the hash
// sync on this flag to avoid the error during hydration.
let routerReady = $state(false);
// One-shot guard so the deep-link seed wins the first race: the hash is only
// readable in the browser (SSR serialized 0), so seed currentSlideIndex from the
// hash exactly once in afterNavigate — before StoryMode mounts and before the
// hash-sync effect is armed — then mark it seeded.
let hashSeeded = $state(false);
afterNavigate(() => {
	if (!hashSeeded) {
		currentSlideIndex = parseSlideHash(window.location.hash, data.slides.length);
		hashSeeded = true;
	}
	routerReady = true;
});

// Use replaceState so slide navigation does not pollute the browser Back stack.
// Gated on hashSeeded so its first run sees currentSlideIndex already equal to
// the deep-linked slide (no transient replaceState back to #slide=0).
$effect(() => {
	if (!browser || !routerReady || !hashSeeded) return;
	const next = `#slide=${currentSlideIndex}`;
	if (window.location.hash !== next) {
		const url = new URL(window.location.href);
		url.hash = next;
		replaceState(url, {});
	}
});

function handleModeChange(newMode: ViewMode): void {
	viewMode = newMode;
}

function handleScrollModeSwitch(slideIndex: number): void {
	currentSlideIndex = slideIndex;
	viewMode = 'story';
}

function handleComplete(): void {
	showSummary = true;
}

function handleClose(): void {
	let sameOrigin = false;
	if (document.referrer) {
		try {
			sameOrigin = new URL(document.referrer).origin === window.location.origin;
		} catch {
			sameOrigin = false;
		}
	}
	if (sameOrigin && window.history.length > 1) {
		window.history.back();
	} else {
		goto('/');
	}
}

function handleRestart(): void {
	showSummary = false;
	viewMode = 'story';
	currentSlideIndex = 0;
	// Clear the hash before remount so StoryMode does not seed itself from the
	// stale summary slide index.
	if (browser && routerReady) {
		const url = new URL(window.location.href);
		url.hash = '#slide=0';
		replaceState(url, {});
	}
	storyKey++;
}

function handleHome(): void {
	if (data.isAdmin) {
		goto('/admin');
	} else if (data.isLoggedIn) {
		goto('/dashboard');
	} else {
		goto('/');
	}
}

function handleShare(): void {
	showShareModal = true;
}
</script>

<svelte:head>
	<title>Server Wrapped {data.year} - Obzorarr</title>
	<meta name="description" content="Year in Review statistics for {data.year}" />
</svelte:head>

<div class="wrapped-page">
	{#if data.showLogo}
		<div class="logo-watermark">
			<Logo size="sm" />
		</div>
	{/if}

	<div class="mode-toggle-container">
		<ModeToggle mode={viewMode} onModeChange={handleModeChange} />
	</div>

	{#if data.availableYears && data.availableYears.length > 1}
		<YearNavigation currentYear={data.year} availableYears={data.availableYears} />
	{/if}

	{#if showSummary}
		<SummaryPage
			stats={data.stats}
			year={data.year}
			onRestart={handleRestart}
			onHome={handleHome}
			onShare={handleShare}
		/>
	{:else if viewMode === 'story'}
		{#key storyKey}
			<StoryMode
				stats={data.stats}
				slides={data.slides}
				customSlides={data.customSlidesMap}
				initialSlideIndex={currentSlideIndex}
				onSlideChange={(index) => (currentSlideIndex = index)}
				onComplete={handleComplete}
				onClose={handleClose}
				{messagingContext}
			/>
		{/key}
	{:else}
		<ScrollMode
			stats={data.stats}
			slides={data.slides}
			customSlides={data.customSlidesMap}
			initialSlideIndex={currentSlideIndex}
			onModeSwitch={handleScrollModeSwitch}
			onClose={handleClose}
			{messagingContext}
		/>
	{/if}

	<ShareModal
		bind:open={showShareModal}
		onOpenChange={(v) => (showShareModal = v)}
		currentUrl={data.currentUrl}
		isOwner={false}
		isAdmin={data.isAdmin}
		isServerWrapped={true}
	/>
</div>

<style>
	.wrapped-page {
			position: relative;
			width: 100%;
			min-height: 100vh;
			min-height: 100dvh;
			background: var(
				--slide-bg-gradient,
				linear-gradient(
					135deg,
					oklch(var(--slide-bg-start)) 0%,
					oklch(var(--slide-bg-end)) 100%
				)
			);
		}

		.logo-watermark {
			position: fixed;
			top: 1rem;
			left: 1rem;
			z-index: 99;
			opacity: 0.8;
			pointer-events: none;
		}

		.mode-toggle-container {
			position: fixed;
			top: 1rem;
			right: 1rem;
			z-index: 100;
		}
</style>
