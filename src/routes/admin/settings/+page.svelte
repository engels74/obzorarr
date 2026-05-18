<script lang="ts">
import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
import BookOpen from '@lucide/svelte/icons/book-open';
import Bot from '@lucide/svelte/icons/bot';
import Bug from '@lucide/svelte/icons/bug';
import Calendar from '@lucide/svelte/icons/calendar';
import Check from '@lucide/svelte/icons/check';
import ChevronDown from '@lucide/svelte/icons/chevron-down';
import CircleHelp from '@lucide/svelte/icons/circle-help';
import Clock from '@lucide/svelte/icons/clock';
import Crosshair from '@lucide/svelte/icons/crosshair';
import Database from '@lucide/svelte/icons/database';
import ExternalLink from '@lucide/svelte/icons/external-link';
import Eye from '@lucide/svelte/icons/eye';
import EyeOff from '@lucide/svelte/icons/eye-off';
import Globe from '@lucide/svelte/icons/globe';
import Hash from '@lucide/svelte/icons/hash';
import Image from '@lucide/svelte/icons/image';
import ImageOff from '@lucide/svelte/icons/image-off';
import Link from '@lucide/svelte/icons/link';
import Loader2 from '@lucide/svelte/icons/loader-2';
import Lock from '@lucide/svelte/icons/lock';
import Monitor from '@lucide/svelte/icons/monitor';
import Palette from '@lucide/svelte/icons/palette';
import Plug from '@lucide/svelte/icons/plug';
import RefreshCw from '@lucide/svelte/icons/refresh-cw';
import ScrollText from '@lucide/svelte/icons/scroll-text';
import Server from '@lucide/svelte/icons/server';
// Lucide Icons
import Settings from '@lucide/svelte/icons/settings';
import Shield from '@lucide/svelte/icons/shield';
import ShieldAlert from '@lucide/svelte/icons/shield-alert';
import ShieldCheck from '@lucide/svelte/icons/shield-check';
import Sparkles from '@lucide/svelte/icons/sparkles';
import ToggleRight from '@lucide/svelte/icons/toggle-right';
import Trash2 from '@lucide/svelte/icons/trash-2';
import UserCheck from '@lucide/svelte/icons/user-check';
import Users from '@lucide/svelte/icons/users';
import VenetianMask from '@lucide/svelte/icons/venetian-mask';
import X from '@lucide/svelte/icons/x';
import Zap from '@lucide/svelte/icons/zap';
import { type Component, tick, untrack } from 'svelte';
import { prefersReducedMotion } from 'svelte/motion';
import { enhance } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { page } from '$app/stores';
import * as AlertDialog from '$lib/components/ui/alert-dialog';
import * as Tabs from '$lib/components/ui/tabs';
import { handleFormToast } from '$lib/utils/form-toast';
import { submitAction } from '$lib/utils/submit-action';
import type { ActionData, PageData } from './$types';

// Valid tab values
const validTabs = ['connections', 'appearance', 'privacy', 'security', 'data', 'system'] as const;
type TabValue = (typeof validTabs)[number];

type ConfigSource = 'env' | 'db' | 'default';
type ForwardedHeaderName =
	| 'Forwarded'
	| 'X-Forwarded-For'
	| 'X-Forwarded-Host'
	| 'X-Forwarded-Proto'
	| 'X-Real-IP';
type ForwardedPairStatus =
	| 'missing'
	| 'partial'
	| 'invalid-proto'
	| 'unsafe-host'
	| 'invalid-host'
	| 'usable';
type RecommendationAction =
	| 'enable'
	| 'leave-disabled'
	| 'review-proxy'
	| 'appears-working'
	| 'unable-to-determine'
	| 'env-controlled';
type DiagnosticErrorPayload = {
	error?: string;
	message?: string;
};

interface OriginDiagnostic {
	origin: string | null;
	isValid: boolean;
}

interface ConfiguredOriginDiagnostic extends OriginDiagnostic {
	source: ConfigSource;
	isConfigured: boolean;
	isLocked: boolean;
}

interface ReverseProxyDiagnostic {
	trustProxy: {
		enabled: boolean;
		source: ConfigSource;
		isLocked: boolean;
	};
	origins: {
		rawApp: string | null;
		effectiveApp: string | null;
		browser: OriginDiagnostic;
		configuredPublic: ConfiguredOriginDiagnostic;
	};
	forwardedHeaders: {
		present: ForwardedHeaderName[];
		pair: {
			status: ForwardedPairStatus;
			isUsable: boolean;
			protoPresent: boolean;
			hostPresent: boolean;
		};
	};
	sourceAddress: {
		category:
			| 'loopback'
			| 'private-lan'
			| 'docker/private-range'
			| 'tailscale/cgnat'
			| 'link-local'
			| 'public'
			| 'unknown';
	};
	originComparison: {
		browserMatchesRawApp: boolean | null;
		browserMatchesEffectiveApp: boolean | null;
		forwardedPairMatchesBrowser: boolean | null;
	};
	recommendation: {
		action: RecommendationAction;
		summary: string;
	};
	reasons: string[];
	safetyNotice: string;
}

// Active tab state - initialized from URL params if available
let activeTab = $state<TabValue>('connections');

// Sync tab from URL on mount
$effect(() => {
	const urlTab = $page.url?.searchParams?.get('tab');
	if (urlTab && validTabs.includes(urlTab as TabValue)) {
		activeTab = urlTab as TabValue;
	}
});

function selectTab(value: TabValue) {
	activeTab = value;
	const url = new URL($page.url);
	url.searchParams.set('tab', value);
	goto(url, { replaceState: true, noScroll: true, keepFocus: true });
}

/**
 * Admin Settings Page - Command Center Design
 *
 * Manages application configuration with a modern,
 * visually striking interface.
 */

let { data, form }: { data: PageData; form: ActionData } = $props();
type WrappedLogoModeValue = PageData['wrappedLogoOptions'][number]['value'];

// Local form state (initialized and synced via $effect)
let plexServerUrl = $state('');
let plexToken = $state('');
let plexAllowInsecureLocalHttp = $state(false);
let openaiApiKey = $state('');
let openaiBaseUrl = $state('');
let openaiModel = $state('');
let showPlexToken = $state(false);
let showOpenaiKey = $state(false);
let selectedUITheme = $state('');
let selectedWrappedTheme = $state('');
let selectedAnonymization = $state('');
let selectedWrappedLogoMode = $state<WrappedLogoModeValue>(untrack(() => data.wrappedLogoMode));
let syncedWrappedLogoMode = $state<WrappedLogoModeValue>(untrack(() => data.wrappedLogoMode));
let isTesting = $state(false);
let testConnectionResult = $state<{ type: 'success' | 'error'; message: string } | null>(null);
let isTestingAI = $state(false);
let testAIResult = $state<{ type: 'success' | 'error'; message: string } | null>(null);

// Logging settings state
let logRetentionDays = $state(7);
let logMaxCount = $state(50000);
let logDebugEnabled = $state(false);

// Sharing settings state
let selectedServerWrappedMode = $state('public');
let selectedDefaultShareMode = $state('public');
let allowUserControl = $state(true);
let syncedAnonymization = $state('');
let syncedServerWrappedMode = $state('public');
let syncedDefaultShareMode = $state('public');
let syncedAllowUserControl = $state(true);
let isSavingServerWrappedSettings = $state(false);
let isSavingUserDefaults = $state(false);
let isBulkApplyingUserControl = $state(false);

let bulkApplyShareDefaultsDialogOpen = $state(false);

async function confirmBulkApplyShareDefaults() {
	bulkApplyShareDefaultsDialogOpen = false;
	isBulkApplyingUserControl = true;

	try {
		const result = await submitAction<{ success: boolean; message: string }>(
			'?/bulkApplyShareDefaults'
		);
		if (result.type === 'success') {
			handleFormToast(result.data);
		} else if (result.type === 'failure') {
			handleFormToast({ error: result.data.error ?? 'Failed to apply defaults.' });
		} else if (result.type === 'error') {
			handleFormToast({ error: result.error.message ?? 'Failed to apply defaults.' });
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to apply defaults.';
		handleFormToast({ error: message });
	} finally {
		isBulkApplyingUserControl = false;
	}
}

// Track sources for display
let plexServerUrlSource = $state<'env' | 'db' | 'default'>('default');
let plexTokenSource = $state<'env' | 'db' | 'default'>('default');
let openaiApiKeySource = $state<'env' | 'db' | 'default'>('default');
let openaiBaseUrlSource = $state<'env' | 'db' | 'default'>('default');
let openaiModelSource = $state<'env' | 'db' | 'default'>('default');

// Track locked state (ENV takes precedence and cannot be changed via UI)
let plexServerUrlLocked = $state(false);
let plexTokenLocked = $state(false);
let openaiApiKeyLocked = $state(false);
let openaiBaseUrlLocked = $state(false);
let openaiModelLocked = $state(false);
let csrfOriginLocked = $state(false);
let csrfHelpOpen = $state(false);
let trustProxyHelpOpen = $state(false);

// Secret fields: true when a value is stored server-side (DB or ENV).
// Used to display a placeholder without exposing the raw value.
let plexTokenHasValue = $state(false);
let openaiApiKeyHasValue = $state(false);

// Mirror the server's URL-match gate in testPlexConnection: the stored token
// fallback is only honoured when the submitted URL equals the stored URL
// (same trailing-slash normalisation). When the URL changes, a fresh token
// must be entered — disable Test and show a hint so users get a clear signal
// instead of a deterministic 400.
const storedPlexServerUrl = $derived(data.settings.plexServerUrl.value);
const plexUrlChanged = $derived(
	(plexServerUrl ?? '').replace(/\/+$/, '') !== (storedPlexServerUrl ?? '').replace(/\/+$/, '')
);
const showPlexInsecureLocalHttp = $derived(
	plexServerUrl.trim().toLowerCase().startsWith('http://')
);
const showClearOpenaiKey = $derived(
	openaiApiKeySource === 'db' && openaiApiKeyHasValue && !openaiApiKeyLocked
);
const showResetOpenaiModel = $derived(openaiModelSource === 'db' && !openaiModelLocked);
const showOpenaiMaintenanceActions = $derived(showClearOpenaiKey || showResetOpenaiModel);

// Sync local state with data (initial load and after form submission)
$effect(() => {
	plexServerUrl = data.settings.plexServerUrl.value;
	plexAllowInsecureLocalHttp = data.settings.plexAllowInsecureLocalHttp;
	// Secret fields are never hydrated with the raw value; blank input = no change.
	plexToken = '';
	openaiApiKey = '';
	openaiBaseUrl = data.settings.openaiBaseUrl.value;
	openaiModel = data.settings.openaiModel.value;
	plexServerUrlSource = data.settings.plexServerUrl.source;
	plexTokenSource = data.settings.plexToken.source;
	openaiApiKeySource = data.settings.openaiApiKey.source;
	openaiBaseUrlSource = data.settings.openaiBaseUrl.source;
	openaiModelSource = data.settings.openaiModel.source;
	plexServerUrlLocked = data.settings.plexServerUrl.isLocked;
	plexTokenLocked = data.settings.plexToken.isLocked;
	openaiApiKeyLocked = data.settings.openaiApiKey.isLocked;
	openaiBaseUrlLocked = data.settings.openaiBaseUrl.isLocked;
	openaiModelLocked = data.settings.openaiModel.isLocked;
	plexTokenHasValue = data.settings.plexToken.hasValue;
	openaiApiKeyHasValue = data.settings.openaiApiKey.hasValue;
	selectedUITheme = data.uiTheme;
	selectedWrappedTheme = data.wrappedTheme;
	selectedAnonymization = data.anonymizationMode;
	logRetentionDays = data.logSettings.retentionDays;
	logMaxCount = data.logSettings.maxCount;
	logDebugEnabled = data.logSettings.debugEnabled;
	selectedServerWrappedMode = data.serverWrappedShareMode;
	selectedDefaultShareMode = data.globalDefaults.defaultShareMode;
	allowUserControl = data.globalDefaults.allowUserControl;
	syncedAnonymization = data.anonymizationMode;
	syncedServerWrappedMode = data.serverWrappedShareMode;
	syncedDefaultShareMode = data.globalDefaults.defaultShareMode;
	syncedAllowUserControl = data.globalDefaults.allowUserControl;
});

$effect(() => {
	const serverWrappedLogoMode = data.wrappedLogoMode;
	if (serverWrappedLogoMode === syncedWrappedLogoMode) return;

	selectedWrappedLogoMode = serverWrappedLogoMode;
	syncedWrappedLogoMode = serverWrappedLogoMode;
});

// Source label helper
function getSourceLabel(source: 'env' | 'db' | 'default'): string {
	switch (source) {
		case 'env':
			return 'Environment';
		case 'db':
			return 'Database';
		default:
			return 'Default';
	}
}

// Theme display names
const themeLabels: Record<string, string> = {
	'modern-minimal': 'Modern Minimal',
	supabase: 'Supabase',
	'doom-64': 'Doom 64',
	'amber-minimal': 'Amber Minimal',
	'soviet-red': 'Soviet Red'
};

// Anonymization descriptions
const anonymizationDescriptions: Record<string, string> = {
	real: 'Show actual usernames in all statistics',
	anonymous: 'Replace usernames with "User #1", "User #2", etc.',
	hybrid: 'Users see their own name, others are anonymized'
};

// Wrapped logo mode descriptions
const wrappedLogoDescriptions: Record<WrappedLogoModeValue, string> = {
	always_show: 'Logo always visible on wrapped pages',
	always_hide: 'Logo hidden on all wrapped pages',
	user_choice: 'Users can toggle logo visibility'
};

const wrappedLogoIcons: Record<WrappedLogoModeValue, Component> = {
	always_show: Image,
	always_hide: ImageOff,
	user_choice: ToggleRight
};

function selectWrappedLogoMode(mode: WrappedLogoModeValue): void {
	selectedWrappedLogoMode = mode;
}

function formatUptime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '—';
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remaining = Math.floor(seconds % 60);
	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	if (parts.length === 0) parts.push(`${remaining}s`);
	return parts.join(' ');
}

function restoreServerWrappedSettings(): void {
	selectedAnonymization = syncedAnonymization;
	selectedServerWrappedMode = syncedServerWrappedMode;
}

function restoreUserDefaults(): void {
	selectedDefaultShareMode = syncedDefaultShareMode;
	allowUserControl = syncedAllowUserControl;
}

function restoreLogSettings(): void {
	logRetentionDays = data.logSettings.retentionDays;
	logMaxCount = data.logSettings.maxCount;
	logDebugEnabled = data.logSettings.debugEnabled;
}

// Show toast notifications for form responses
$effect(() => {
	handleFormToast(form);
});

// Open the CSRF mismatch confirmation dialog when the server signals it.
// The fail(409) payload deliberately omits success/error/warning so handleFormToast
// stays silent — the dialog is the UI response.
$effect(() => {
	if (form && 'requireConfirmation' in form && form.requireConfirmation) {
		const f = form as { attemptedOrigin?: string };
		pendingCsrfOrigin = f.attemptedOrigin ?? null;
		csrfMismatchDialogOpen = true;
	}
});

$effect(() => {
	if (activeTab !== 'security' || trustProxyDiagnosticAutoRunStarted) return;

	trustProxyDiagnosticAutoRunStarted = true;
	void runTrustProxyDiagnostic();
});

// Cache clearing dialog state
let cacheDialogOpen = $state(false);
let pendingCacheYear = $state<number | undefined>(undefined);
let pendingCacheCount = $state(0);
let loadingCount = $state(false);
let isClearing = $state(false);
let cacheCountResult = $state<{ label: string; count: number } | null>(null);
let cacheCountResultElement: HTMLElement | undefined = $state();

// Play history clearing dialog state
let historyDialogOpen = $state(false);
let pendingHistoryYear = $state<number | undefined>(undefined);
let pendingHistoryCount = $state(0);
let loadingHistoryCount = $state(false);
let isClearingHistory = $state(false);
let historyCountResult = $state<{ label: string; count: number } | null>(null);
let historyCountResultElement: HTMLElement | undefined = $state();

async function focusCountResult(getElement: () => HTMLElement | undefined): Promise<void> {
	await tick();
	const element = getElement();
	if (!element) return;
	element.scrollIntoView({
		block: 'center',
		behavior: prefersReducedMotion.current ? 'auto' : 'smooth'
	});
	element.focus({ preventScroll: true });
}

// Open cache clearing confirmation dialog
async function showCacheConfirmation(year?: number) {
	loadingCount = true;
	pendingCacheYear = year;

	const formData = new FormData();
	if (year !== undefined) {
		formData.append('year', year.toString());
	}

	try {
		const result = await submitAction<{ success?: boolean; count?: number; year?: number }>(
			'?/getCacheCount',
			formData
		);
		const payload = result.type === 'success' ? result.data : {};
		if (payload.count !== undefined) {
			pendingCacheCount = payload.count;
			cacheDialogOpen = true;
		} else {
			handleFormToast({ error: 'Failed to prepare delete preview.' });
		}
	} catch (error) {
		console.error('Failed to get cache count:', error);
		handleFormToast({ error: 'Failed to prepare delete preview. Please try again.' });
	} finally {
		loadingCount = false;
	}
}

async function getCacheCount(year?: number) {
	loadingCount = true;
	pendingCacheYear = year;
	cacheCountResult = null;

	const formData = new FormData();
	if (year !== undefined) {
		formData.append('year', year.toString());
	}

	try {
		const result = await submitAction<{ success?: boolean; count?: number; year?: number }>(
			'?/getCacheCount',
			formData
		);
		const payload = result.type === 'success' ? result.data : {};
		if (payload.count !== undefined) {
			cacheCountResult = {
				label: year !== undefined ? `${year} cache` : 'All cache',
				count: payload.count
			};
			handleFormToast({
				success: true,
				message: `${cacheCountResult.label}: ${formatRecordCount(cacheCountResult.count)}`
			});
			await focusCountResult(() => cacheCountResultElement);
		} else {
			handleFormToast({ error: 'Failed to get cache count.' });
		}
	} catch (error) {
		console.error('Failed to get cache count:', error);
		handleFormToast({ error: 'Failed to get cache count. Please try again.' });
	} finally {
		loadingCount = false;
	}
}

function handleCacheCleared() {
	cacheDialogOpen = false;
	pendingCacheYear = undefined;
	pendingCacheCount = 0;
}

function getCacheConfirmationMessage(): string {
	if (pendingCacheYear !== undefined) {
		return `This will permanently delete ${pendingCacheCount} cached statistics record${pendingCacheCount !== 1 ? 's' : ''} for ${pendingCacheYear}.`;
	}
	return `This will permanently delete ${pendingCacheCount} cached statistics record${pendingCacheCount !== 1 ? 's' : ''} across all years.`;
}

async function showHistoryConfirmation(year?: number) {
	loadingHistoryCount = true;
	pendingHistoryYear = year;

	// Year-undefined ("Delete All History") uses the load-time total — the page
	// always knows the count even if the user hasn't pressed "Get Count" first,
	// so the dialog renders without a probe request and never has a no-count path
	// that could look like a silent failure (ISSUE-003).
	if (year === undefined) {
		pendingHistoryCount = data.playHistoryTotalCount;
		historyDialogOpen = true;
		loadingHistoryCount = false;
		return;
	}

	const formData = new FormData();
	formData.append('year', year.toString());

	try {
		const result = await submitAction<{ success?: boolean; count?: number; year?: number }>(
			'?/getPlayHistoryCount',
			formData
		);
		const payload = result.type === 'success' ? result.data : {};
		if (payload.count !== undefined) {
			pendingHistoryCount = payload.count;
			historyDialogOpen = true;
		} else {
			handleFormToast({ error: 'Failed to prepare delete preview.' });
		}
	} catch (error) {
		console.error('Failed to get history count:', error);
		handleFormToast({ error: 'Failed to prepare delete preview. Please try again.' });
	} finally {
		loadingHistoryCount = false;
	}
}

async function getHistoryCount(year?: number) {
	loadingHistoryCount = true;
	pendingHistoryYear = year;
	historyCountResult = null;

	const formData = new FormData();
	if (year !== undefined) {
		formData.append('year', year.toString());
	}

	try {
		const result = await submitAction<{ success?: boolean; count?: number; year?: number }>(
			'?/getPlayHistoryCount',
			formData
		);
		const payload = result.type === 'success' ? result.data : {};
		if (payload.count !== undefined) {
			historyCountResult = {
				label: year !== undefined ? `${year} history` : 'All history',
				count: payload.count
			};
			handleFormToast({
				success: true,
				message: `${historyCountResult.label}: ${formatRecordCount(historyCountResult.count)}`
			});
			await focusCountResult(() => historyCountResultElement);
		} else {
			handleFormToast({ error: 'Failed to get play history count.' });
		}
	} catch (error) {
		console.error('Failed to get history count:', error);
		handleFormToast({ error: 'Failed to get play history count. Please try again.' });
	} finally {
		loadingHistoryCount = false;
	}
}

function handleHistoryCleared() {
	historyDialogOpen = false;
	pendingHistoryYear = undefined;
	pendingHistoryCount = 0;
}

function getHistoryConfirmationMessage(): string {
	if (pendingHistoryYear !== undefined) {
		return `This will permanently delete ${pendingHistoryCount} play history record${pendingHistoryCount !== 1 ? 's' : ''} for ${pendingHistoryYear}.`;
	}
	return `This will permanently delete ${pendingHistoryCount} play history record${pendingHistoryCount !== 1 ? 's' : ''} across all years.`;
}

function formatRecordCount(count: number): string {
	return `${count.toLocaleString()} record${count === 1 ? '' : 's'}`;
}

// Tab configuration with icons
const tabConfig = [
	{ value: 'connections' as const, label: 'Connections', icon: Plug },
	{ value: 'appearance' as const, label: 'Appearance', icon: Palette },
	{ value: 'privacy' as const, label: 'Privacy', icon: Shield },
	{ value: 'security' as const, label: 'Security', icon: ShieldCheck },
	{ value: 'data' as const, label: 'Data', icon: Database },
	{ value: 'system' as const, label: 'System', icon: Server }
];

// Security state
let isTestingCsrf = $state(false);
let docsExpanded = $state(false);
let csrfOriginValue = $state('');
let csrfOriginSource = $state<'env' | 'db' | 'default'>('default');
let isSavingCsrf = $state(false);
let csrfClearDialogOpen = $state(false);
let isClearingCsrf = $state(false);
let isResettingCsrfWarning = $state(false);
let trustProxyValue = $state(false);
let trustProxySource = $state<'env' | 'db' | 'default'>('default');
let trustProxyLocked = $state(false);
let isSavingTrustProxy = $state(false);
let trustProxyConfirmDialogOpen = $state(false);
let isConfirmingTrustProxy = $state(false);
let isCheckingTrustProxyDiagnostic = $state(false);
let trustProxyDiagnosticAutoRunStarted = $state(false);
let trustProxyDiagnostic = $state<ReverseProxyDiagnostic | null>(null);
let trustProxyDiagnosticError = $state<string | null>(null);

// CSRF mismatch confirmation dialog state. Server returns fail(409,
// { requireConfirmation: true, attemptedOrigin, ... }) when the submitted
// origin doesn't match the request origin; we surface it as a confirm
// dialog rather than silently writing a value that would lock the user out.
let csrfMismatchDialogOpen = $state(false);
let pendingCsrfOrigin = $state<string | null>(null);
let isConfirmingCsrfMismatch = $state(false);
let isSavingOpenAI = $state(false);
let isSavingPlex = $state(false);
let isSavingUITheme = $state(false);
let isSavingWrappedTheme = $state(false);
let isSavingWrappedLogoMode = $state(false);
let isSavingLogSettings = $state(false);

// Sync CSRF state from data
$effect(() => {
	csrfOriginValue = data.security.originValue;
	csrfOriginSource = data.security.originSource;
	csrfOriginLocked = data.security.originLocked;
	trustProxyValue = data.security.trustProxyValue;
	trustProxySource = data.security.trustProxySource;
	trustProxyLocked = data.security.trustProxyLocked;
});

// Detect current URL for CSRF origin
function detectCurrentUrl() {
	if (typeof window !== 'undefined') {
		csrfOriginValue = window.location.origin;
	}
}

function formatOrigin(origin: string | null): string {
	return origin ?? 'Not available';
}

function formatComparison(value: boolean | null): string {
	if (value === true) return 'Matches';
	if (value === false) return 'Does not match';
	return 'Unknown';
}

function getForwardedPairLabel(status: ForwardedPairStatus): string {
	switch (status) {
		case 'usable':
			return 'Usable proto and host pair';
		case 'partial':
			return 'Partial proto/host pair';
		case 'invalid-proto':
		case 'unsafe-host':
		case 'invalid-host':
			return 'Invalid proto/host pair';
		default:
			return 'No proto/host pair';
	}
}

function getRecommendationLabel(action: RecommendationAction): string {
	switch (action) {
		case 'enable':
			return 'Enable';
		case 'leave-disabled':
			return 'Leave disabled';
		case 'review-proxy':
			return 'Review proxy setup';
		case 'appears-working':
			return 'Already enabled';
		case 'env-controlled':
			return 'Already controlled by environment';
		default:
			return 'Unable to determine safely';
	}
}

function getTrustProxySourceLabel(source: ConfigSource): string {
	return source === 'env' ? 'environment' : source === 'db' ? 'database' : 'default';
}

async function runTrustProxyDiagnostic() {
	if (isCheckingTrustProxyDiagnostic) return;

	isCheckingTrustProxyDiagnostic = true;
	trustProxyDiagnosticError = null;

	try {
		const browserOrigin = typeof window === 'undefined' ? '' : window.location.origin;
		const params = new URLSearchParams();
		if (browserOrigin) params.set('browserOrigin', browserOrigin);

		const query = params.toString();
		const response = await fetch(
			`/api/security/reverse-proxy-diagnostic${query ? `?${query}` : ''}`,
			{
				headers: { Accept: 'application/json' }
			}
		);
		const payload = await response.json();

		if (!response.ok) {
			const diagnosticError = payload as DiagnosticErrorPayload;
			trustProxyDiagnostic = null;
			trustProxyDiagnosticError =
				diagnosticError.error ?? diagnosticError.message ?? 'Unable to run the diagnostic.';
			return;
		}

		trustProxyDiagnostic = payload as ReverseProxyDiagnostic;
	} catch (error) {
		trustProxyDiagnostic = null;
		trustProxyDiagnosticError =
			error instanceof Error ? error.message : 'Unable to run the diagnostic.';
	} finally {
		isCheckingTrustProxyDiagnostic = false;
	}
}

const logFieldErrors = $derived(
	form && 'fieldErrors' in form
		? (form.fieldErrors as Record<string, string[] | undefined>)
		: undefined
);
</script>

<div class="settings-command-center">
	<!-- Page Header -->
	<header class="page-header">
		<div class="header-content">
			<div class="header-icon">
				<Settings />
			</div>
			<div class="header-text">
				<h1>Settings</h1>
				<p class="header-subtitle">Application Configuration Center</p>
			</div>
		</div>
	</header>

	<!-- Tab Navigation -->
	<nav class="tab-nav">
		{#each tabConfig as tab}
			<button
				type="button"
				class="tab-button"
				class:active={activeTab === tab.value}
				aria-label={`Open ${tab.label} settings`}
				aria-pressed={activeTab === tab.value}
				aria-current={activeTab === tab.value ? 'page' : undefined}
				onclick={() => selectTab(tab.value)}
			>
				<tab.icon class="tab-icon" />
				<span class="tab-label">{tab.label}</span>
			</button>
		{/each}
	</nav>

	<!-- Tab Content -->
	<div class="tab-content">
		<!-- Connections Tab -->
		{#if activeTab === 'connections'}
			<div class="content-grid">
				<!-- Plex Configuration Panel -->
				<section class="panel plex-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Zap class="panel-icon plex" />
							<h2>Plex Server</h2>
						</div>
						<div
							class="connection-status"
							class:connected={plexServerUrl && (plexToken || plexTokenHasValue)}
						>
							<span class="status-dot"></span>
							<span class="status-text"
								>{plexServerUrl && (plexToken || plexTokenHasValue)
									? 'Configured'
									: 'Not configured'}</span
							>
						</div>
					</div>

					<form
						method="POST"
						action="?/updateApiConfig"
						use:enhance={() => {
							isSavingPlex = true;
							return async ({ update }) => {
								try {
									await update();
								} finally {
									isSavingPlex = false;
								}
							};
						}}
						class="panel-form"
					>
						<input type="hidden" name="apiConfigVersion" value={data.apiConfigVersion} />
						<div class="form-field">
							<div class="field-header">
								<label for="plexServerUrl">Server URL</label>
								{#if plexServerUrlLocked}
									<span class="env-lock-badge">
										<Lock class="badge-icon" />
										Set via environment variable
									</span>
								{:else if plexServerUrlSource !== 'default'}
									<span class="source-badge" class:env={plexServerUrlSource === 'env'}>
										{getSourceLabel(plexServerUrlSource)}
									</span>
								{/if}
							</div>
							<input
								type="url"
								id="plexServerUrl"
								name="plexServerUrl"
								bind:value={plexServerUrl}
								maxlength="512"
								placeholder="http://192.168.1.100:32400"
								class:from-env={plexServerUrlLocked}
								disabled={plexServerUrlLocked}
							/>
							{#if plexServerUrlLocked}
								<span class="field-hint env-hint"
									>This value is set via PLEX_SERVER_URL environment variable</span
								>
							{:else}
								<span class="field-hint">Your Plex Media Server address</span>
							{/if}
						</div>

						{#if showPlexInsecureLocalHttp && !plexServerUrlLocked}
							<label class="checkbox-row">
								<input
									type="checkbox"
									name="plexAllowInsecureLocalHttp"
									value="true"
									bind:checked={plexAllowInsecureLocalHttp}
								/>
								<span>Allow insecure local HTTP Plex connection</span>
							</label>
						{/if}

						<div class="form-field">
							<div class="field-header">
								<label for="plexToken">Authentication Token</label>
								{#if plexTokenLocked}
									<span class="env-lock-badge">
										<Lock class="badge-icon" />
										Set via environment variable
									</span>
								{:else if plexTokenSource !== 'default'}
									<span class="source-badge" class:env={plexTokenSource === 'env'}>
										{getSourceLabel(plexTokenSource)}
									</span>
								{/if}
							</div>
							<div class="input-with-action">
								<input
									type={showPlexToken ? 'text' : 'password'}
									id="plexToken"
									name="plexToken"
									bind:value={plexToken}
									maxlength="512"
									placeholder={plexTokenHasValue
										? '(unchanged — re-enter to change)'
										: 'X-Plex-Token'}
									class:from-env={plexTokenLocked}
									disabled={plexTokenLocked}
								/>
								<button
									type="button"
									class="input-action"
									onclick={() => (showPlexToken = !showPlexToken)}
									aria-label={showPlexToken ? 'Hide token' : 'Show token'}
									disabled={plexTokenLocked}
								>
									{#if showPlexToken}
										<EyeOff />
									{:else}
										<Eye />
									{/if}
								</button>
							</div>
							{#if plexTokenLocked}
								<span class="field-hint env-hint"
									>This value is set via PLEX_TOKEN environment variable</span
								>
							{:else if plexUrlChanged && !plexToken && plexTokenHasValue}
								<span class="field-hint">
									Enter a token for the new server URL before testing the connection.
								</span>
							{/if}
						</div>

						<div class="panel-actions plex-actions">
							{#if !plexServerUrlLocked || !plexTokenLocked}
								<button type="submit" class="btn-primary" disabled={isSavingPlex}>
									{#if isSavingPlex}
										<Loader2 class="btn-icon spinning" />
										Saving…
									{:else}
										<Check class="btn-icon" />
										Save Plex Settings
									{/if}
								</button>
							{/if}

							<button
								type="button"
								class="btn-secondary"
								disabled={isTesting ||
									!plexServerUrl ||
									(plexUrlChanged ? !plexToken : !plexToken && !plexTokenHasValue)}
								onclick={async () => {
									isTesting = true;
									testConnectionResult = null;
									const formData = new FormData();
									formData.set('plexServerUrl', plexServerUrl);
									formData.set('plexToken', plexToken);
									formData.set(
										'plexAllowInsecureLocalHttp',
										plexAllowInsecureLocalHttp ? 'true' : 'false'
									);
									try {
										const result = await submitAction<{
											success?: boolean;
											message?: string;
											error?: string;
										}>('?/testPlexConnection', formData);
										if (result.type === 'success' || result.type === 'failure') {
											const data = result.data;
											handleFormToast(data);
											testConnectionResult = data.error
												? { type: 'error', message: data.error }
												: {
														type: 'success',
														message: data.message ?? 'Plex connection succeeded'
													};
										} else if (result.type === 'error') {
											const message =
												result.error.message ?? 'An error occurred while testing connection';
											handleFormToast({ error: message });
											testConnectionResult = { type: 'error', message };
										} else {
											const message = 'Unexpected response from server';
											handleFormToast({ error: message });
											testConnectionResult = { type: 'error', message };
										}
									} catch {
										const message = 'Failed to test connection. Please check your network and try again.';
										handleFormToast({ error: message });
										testConnectionResult = { type: 'error', message };
									} finally {
										isTesting = false;
									}
								}}
							>
								{#if isTesting}
									<Loader2 class="btn-icon spinning" />
									Testing...
								{:else}
									<Zap class="btn-icon" />
									Test Connection
								{/if}
							</button>
						</div>

						{#if plexServerUrlLocked && plexTokenLocked}
							<div class="panel-info">
								<span class="info-text"
									>All Plex settings are managed via environment variables</span
								>
							</div>
						{/if}
						{#if testConnectionResult}
							<div class="inline-result" class:error={testConnectionResult.type === 'error'}>
								{testConnectionResult.message}
							</div>
						{/if}
					</form>
				</section>

				<!-- OpenAI Configuration Panel -->
				<section class="panel openai-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Bot class="panel-icon openai" />
							<h2>OpenAI</h2>
						</div>
						<span class="panel-badge optional">Optional</span>
					</div>

					<p class="panel-description">
						Configure AI-powered fun facts generation. Leave empty to use predefined templates.
					</p>

					<form
						method="POST"
						action="?/updateApiConfig"
						use:enhance={() => {
							isSavingOpenAI = true;
							return async ({ update }) => {
								try {
									await update();
								} finally {
									isSavingOpenAI = false;
								}
							};
						}}
						class="panel-form"
					>
						<input type="hidden" name="apiConfigVersion" value={data.apiConfigVersion} />
						<div class="form-field">
							<div class="field-header">
								<label for="openaiApiKey">API Key</label>
								{#if openaiApiKeyLocked}
									<span class="env-lock-badge">
										<Lock class="badge-icon" />
										Set via environment variable
									</span>
								{:else if openaiApiKeySource !== 'default'}
									<span class="source-badge" class:env={openaiApiKeySource === 'env'}>
										{getSourceLabel(openaiApiKeySource)}
									</span>
								{/if}
							</div>
							<div class="input-with-action">
								<input
									type={showOpenaiKey ? 'text' : 'password'}
									id="openaiApiKey"
									name="openaiApiKey"
									bind:value={openaiApiKey}
									maxlength="512"
									placeholder={openaiApiKeyHasValue
										? '(unchanged — re-enter to change)'
										: 'sk-...'}
									class:from-env={openaiApiKeyLocked}
									disabled={openaiApiKeyLocked}
								/>
								<button
									type="button"
									class="input-action"
									onclick={() => (showOpenaiKey = !showOpenaiKey)}
									aria-label={showOpenaiKey ? 'Hide key' : 'Show key'}
									disabled={openaiApiKeyLocked}
								>
									{#if showOpenaiKey}
										<EyeOff />
									{:else}
										<Eye />
									{/if}
								</button>
							</div>
							{#if openaiApiKeyLocked}
								<span class="field-hint env-hint"
									>This value is set via OPENAI_API_KEY environment variable</span
								>
							{/if}
						</div>

						<div class="form-row">
							<div class="form-field">
								<div class="field-header">
									<label for="openaiBaseUrl">Base URL</label>
									{#if openaiBaseUrlLocked}
										<span class="env-lock-badge">
											<Lock class="badge-icon" />
											Set via environment variable
										</span>
									{:else if openaiBaseUrlSource !== 'default'}
										<span class="source-badge" class:env={openaiBaseUrlSource === 'env'}>
											{getSourceLabel(openaiBaseUrlSource)}
										</span>
									{/if}
								</div>
								<input
									type="url"
									id="openaiBaseUrl"
									name="openaiBaseUrl"
									bind:value={openaiBaseUrl}
									maxlength="512"
									placeholder="https://api.openai.com/v1"
									class:from-env={openaiBaseUrlLocked}
									disabled={openaiBaseUrlLocked}
								/>
								{#if openaiBaseUrlLocked}
									<span class="field-hint env-hint"
										>Set via OPENAI_API_URL environment variable</span
									>
								{:else}
									<span class="field-hint">Custom endpoint (optional)</span>
								{/if}
							</div>

							<div class="form-field">
								<div class="field-header">
									<label for="openaiModel">Model</label>
									{#if openaiModelLocked}
										<span class="env-lock-badge">
											<Lock class="badge-icon" />
											Set via environment variable
										</span>
									{:else if openaiModelSource !== 'default'}
										<span class="source-badge" class:env={openaiModelSource === 'env'}>
											{getSourceLabel(openaiModelSource)}
										</span>
									{/if}
								</div>
								<input
									type="text"
									id="openaiModel"
									name="openaiModel"
									bind:value={openaiModel}
									maxlength="100"
									placeholder="gpt-5-mini"
									class:from-env={openaiModelLocked}
									disabled={openaiModelLocked}
								/>
								{#if openaiModelLocked}
									<span class="field-hint env-hint">Set via OPENAI_MODEL environment variable</span>
								{:else}
									<span class="field-hint">Default: gpt-5-mini</span>
								{/if}
							</div>
						</div>

						<div class="panel-actions">
							{#if !openaiApiKeyLocked || !openaiBaseUrlLocked || !openaiModelLocked}
								<button type="submit" class="btn-primary" disabled={isSavingOpenAI}>
									{#if isSavingOpenAI}
										<Loader2 class="btn-icon spinning" />
										Saving…
									{:else}
										<Check class="btn-icon" />
										Save OpenAI Settings
									{/if}
								</button>
							{/if}

							<button
								type="button"
								class="btn-secondary"
								disabled={isTestingAI || (!openaiApiKey.trim() && !openaiApiKeyHasValue)}
								onclick={async () => {
									isTestingAI = true;
									testAIResult = null;
									const formData = new FormData();
									formData.set('openaiApiKey', openaiApiKey);
									formData.set('openaiBaseUrl', openaiBaseUrl);
									formData.set('openaiModel', openaiModel);
									try {
										const result = await submitAction<{
											success?: boolean;
											message?: string;
											error?: string;
										}>('?/testAIConnection', formData);
										if (result.type === 'success' || result.type === 'failure') {
											const data = result.data;
											handleFormToast(data);
											testAIResult = data.error
												? { type: 'error', message: data.error }
												: {
														type: 'success',
														message: data.message ?? 'OpenAI connection succeeded'
													};
										} else if (result.type === 'error') {
											const message =
												result.error.message ?? 'An error occurred while testing connection';
											handleFormToast({ error: message });
											testAIResult = { type: 'error', message };
										} else {
											const message = 'Unexpected response from server';
											handleFormToast({ error: message });
											testAIResult = { type: 'error', message };
										}
									} catch {
										const message =
											'Failed to test connection. Please check your network and try again.';
										handleFormToast({ error: message });
										testAIResult = { type: 'error', message };
									} finally {
										isTestingAI = false;
									}
								}}
							>
								{#if isTestingAI}
									<Loader2 class="btn-icon spinning" />
									Testing...
								{:else}
									<Zap class="btn-icon" />
									Test Connection
								{/if}
							</button>
						</div>

						{#if openaiApiKeyLocked && openaiBaseUrlLocked && openaiModelLocked}
							<div class="panel-info">
								<span class="info-text"
									>All OpenAI settings are managed via environment variables</span
								>
							</div>
						{/if}
						{#if testAIResult}
							<div class="inline-result" class:error={testAIResult.type === 'error'}>
								{testAIResult.message}
							</div>
						{/if}
					</form>

					{#if showOpenaiMaintenanceActions}
						<div class="openai-maintenance-row">
							<div class="openai-maintenance-copy">
								<span class="maintenance-title">Stored overrides</span>
								<span class="maintenance-description">
									Remove saved OpenAI values to fall back to defaults or environment settings.
								</span>
							</div>
							<div class="openai-maintenance-actions">
								{#if showClearOpenaiKey}
									<form
										method="POST"
										action="?/clearOpenaiKey"
										use:enhance
										class="openai-maintenance-form"
									>
										<button type="submit" class="btn-destructive">
											<Trash2 class="btn-icon" />
											Clear API Key
										</button>
									</form>
								{/if}

								{#if showResetOpenaiModel}
									<form
										method="POST"
										action="?/clearOpenaiModel"
										use:enhance
										class="openai-maintenance-form"
									>
										<button type="submit" class="btn-secondary">
											<RefreshCw class="btn-icon" />
											Reset Model
										</button>
									</form>
								{/if}
							</div>
						</div>
					{/if}
				</section>
			</div>
		{/if}

		<!-- Appearance Tab -->
		{#if activeTab === 'appearance'}
			<div class="appearance-content">
				<!-- UI Theme Section -->
				<section class="panel theme-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Monitor class="panel-icon" />
							<h2>UI Theme</h2>
						</div>
					</div>
					<p class="panel-description">
						Color theme for dashboard, admin pages, and all non-wrapped pages.
					</p>

					<form
						method="POST"
						action="?/updateUITheme"
						use:enhance={() => {
							isSavingUITheme = true;
							return async ({ update }) => {
								try {
									await update();
								} finally {
									isSavingUITheme = false;
								}
							};
						}}
						class="panel-form"
					>
						<input type="hidden" name="settingsVersion" value={data.uiThemeVersion} />
						<div class="theme-grid">
							{#each data.themeOptions as theme}
								<label class="theme-card" class:selected={selectedUITheme === theme.value}>
									<input
										type="radio"
										name="theme"
										value={theme.value}
										bind:group={selectedUITheme}
									/>
									<div class="theme-preview {theme.value}">
										<div class="theme-gradient"></div>
									</div>
									<span class="theme-name">{themeLabels[theme.value] ?? theme.label}</span>
									{#if selectedUITheme === theme.value}
										<div class="theme-check">
											<Check />
										</div>
									{/if}
								</label>
							{/each}
						</div>
						<div class="panel-actions">
							<button type="submit" class="btn-primary" disabled={isSavingUITheme}>
								{#if isSavingUITheme}
									<Loader2 class="btn-icon spinning" />
									Saving…
								{:else}
									<Palette class="btn-icon" />
									Save UI Theme
								{/if}
							</button>
						</div>
					</form>
				</section>

				<!-- Wrapped Theme Section -->
				<section class="panel theme-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Sparkles class="panel-icon" />
							<h2>Wrapped Theme</h2>
						</div>
					</div>
					<p class="panel-description">
						Color theme for Year in Review slideshow pages at /wrapped/*.
					</p>

					<form
						method="POST"
						action="?/updateWrappedTheme"
						use:enhance={() => {
							isSavingWrappedTheme = true;
							return async ({ update }) => {
								try {
									await update();
								} finally {
									isSavingWrappedTheme = false;
								}
							};
						}}
						class="panel-form"
					>
						<input type="hidden" name="settingsVersion" value={data.wrappedThemeVersion} />
						<div class="theme-grid">
							{#each data.themeOptions as theme}
								<label class="theme-card" class:selected={selectedWrappedTheme === theme.value}>
									<input
										type="radio"
										name="wrappedTheme"
										value={theme.value}
										bind:group={selectedWrappedTheme}
									/>
									<div class="theme-preview {theme.value}">
										<div class="theme-gradient"></div>
									</div>
									<span class="theme-name">{themeLabels[theme.value] ?? theme.label}</span>
									{#if selectedWrappedTheme === theme.value}
										<div class="theme-check">
											<Check />
										</div>
									{/if}
								</label>
							{/each}
						</div>
						<div class="panel-actions">
							<button type="submit" class="btn-primary" disabled={isSavingWrappedTheme}>
								{#if isSavingWrappedTheme}
									<Loader2 class="btn-icon spinning" />
									Saving…
								{:else}
									<Sparkles class="btn-icon" />
									Save Wrapped Theme
								{/if}
							</button>
						</div>
					</form>
				</section>

				<!-- Wrapped Logo Section -->
				<section class="panel theme-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Image class="panel-icon" />
							<h2>Wrapped Page Logo</h2>
						</div>
					</div>
					<p class="panel-description">
						Control logo visibility on Year in Review slideshow pages.
					</p>

					<form
						method="POST"
						action="?/updateWrappedLogoMode"
						use:enhance={() => {
							isSavingWrappedLogoMode = true;
							return async ({ result, update }) => {
								try {
									if (result.type === 'success') {
										syncedWrappedLogoMode = selectedWrappedLogoMode;
										await update({ invalidateAll: true });
									} else {
										await update();
										if (result.type === 'error') {
											handleFormToast({
												error: result.error?.message ?? 'Failed to update logo mode.'
											});
										}
									}
								} finally {
									if (result.type === 'failure' || result.type === 'error') {
										selectedWrappedLogoMode = syncedWrappedLogoMode;
									}
									isSavingWrappedLogoMode = false;
								}
							};
						}}
						class="panel-form"
					>
						<input
							type="hidden"
							name="settingsVersion"
							value={data.wrappedLogoModeVersion}
						/>
						<div class="option-cards">
							{#each data.wrappedLogoOptions as option}
								{@const optionId = `wrapped-logo-mode-${option.value}`}
								{@const LogoModeIcon = wrappedLogoIcons[option.value] ?? ToggleRight}
								<label
									for={optionId}
									class="option-card"
									class:selected={selectedWrappedLogoMode === option.value}
								>
									<input
										id={optionId}
										type="radio"
										name="logoMode"
										value={option.value}
										checked={selectedWrappedLogoMode === option.value}
										onchange={() => selectWrappedLogoMode(option.value)}
									/>
									<div class="option-icon">
										<LogoModeIcon />
									</div>
									<div class="option-content">
										<span class="option-title">{option.label}</span>
										<span class="option-desc">{wrappedLogoDescriptions[option.value]}</span>
									</div>
									{#if selectedWrappedLogoMode === option.value}
										<div class="option-check"><Check /></div>
									{/if}
								</label>
							{/each}
						</div>
						<div class="panel-actions">
							<button type="submit" class="btn-primary" disabled={isSavingWrappedLogoMode}>
								{#if isSavingWrappedLogoMode}
									<Loader2 class="btn-icon spinning" />
									Saving…
								{:else}
									<Image class="btn-icon" />
									Save Logo Mode
								{/if}
							</button>
						</div>
					</form>
				</section>
			</div>
		{/if}

		<!-- Privacy Tab -->
		{#if activeTab === 'privacy'}
			<div class="privacy-content">
				<!-- Form 1: Server-wide Wrapped (anonymization + server-wide share mode) -->
					<form
						method="POST"
						action="?/updateServerWrappedSettings"
						use:enhance={() => {
							isSavingServerWrappedSettings = true;
							return async ({ result, update }) => {
								try {
									if (result.type === 'success') {
										await update({ invalidateAll: true });
										await invalidateAll();
										return;
									}

									// On failure (including 409 OCC conflicts), restore the radio
									// buttons to the synced value, surface the error via the form
									// prop, AND invalidate the load so the hidden settingsVersion
									// refreshes. Without the invalidate, a stale settingsVersion
									// would re-trigger 409 on the user's next click and the UI
									// would silently revert again with no visible cause.
									restoreServerWrappedSettings();
									await update();
									await invalidateAll();
								} finally {
									isSavingServerWrappedSettings = false;
								}
							};
						}}
					>
					<input
						type="hidden"
						name="settingsVersion"
						value={data.serverWrappedSettingsVersion}
					/>

						<section class="panel privacy-panel">
							<div class="panel-header">
								<div class="panel-title">
									<Shield class="panel-icon" />
									<h2>Server-Wide Privacy</h2>
								</div>
							</div>
							<p class="panel-description">
								These settings are saved together for the shared server wrapped experience.
							</p>

							<div class="panel-form privacy-form-body">
								<div class="privacy-setting-group">
									<h3 class="subsection-title">
										<VenetianMask class="subsection-icon" />
										User Identity
									</h3>
									<p class="subsection-hint">Control how usernames appear in server-wide statistics.</p>

									<div class="option-cards">
										<label class="option-card" class:selected={selectedAnonymization === 'real'}>
											<input
												type="radio"
												name="anonymizationMode"
												value="real"
												bind:group={selectedAnonymization}
											/>
											<div class="option-icon">
												<UserCheck />
											</div>
											<div class="option-content">
												<span class="option-title">Real Names</span>
												<span class="option-desc">{anonymizationDescriptions.real}</span>
											</div>
											{#if selectedAnonymization === 'real'}
												<div class="option-check"><Check /></div>
											{/if}
										</label>

										<label class="option-card" class:selected={selectedAnonymization === 'anonymous'}>
											<input
												type="radio"
												name="anonymizationMode"
												value="anonymous"
												bind:group={selectedAnonymization}
											/>
											<div class="option-icon">
												<VenetianMask />
											</div>
											<div class="option-content">
												<span class="option-title">Anonymous</span>
												<span class="option-desc">{anonymizationDescriptions.anonymous}</span>
											</div>
											{#if selectedAnonymization === 'anonymous'}
												<div class="option-check"><Check /></div>
											{/if}
										</label>

										<label class="option-card" class:selected={selectedAnonymization === 'hybrid'}>
											<input
												type="radio"
												name="anonymizationMode"
												value="hybrid"
												bind:group={selectedAnonymization}
											/>
											<div class="option-icon">
												<Users />
											</div>
											<div class="option-content">
												<span class="option-title">Hybrid</span>
												<span class="option-desc">{anonymizationDescriptions.hybrid}</span>
											</div>
											{#if selectedAnonymization === 'hybrid'}
												<div class="option-check"><Check /></div>
											{/if}
										</label>
									</div>
								</div>

								<div class="privacy-setting-group">
									<h3 class="subsection-title">
										<Server class="subsection-icon" />
										Server-Wide Wrapped Access
									</h3>
									<p class="subsection-hint">
										Control who can access the server-wide Year in Review at <code
											>/wrapped/{data.currentYear}</code
										>.
									</p>

									<div class="option-cards two-col">
										<label
											class="option-card"
											class:selected={selectedServerWrappedMode === 'public'}
										>
											<input
												type="radio"
												name="serverWrappedShareMode"
												value="public"
												bind:group={selectedServerWrappedMode}
											/>
											<div class="option-icon">
												<Globe />
											</div>
											<div class="option-content">
												<span class="option-title">Public</span>
												<span class="option-desc">Anyone can view</span>
											</div>
											{#if selectedServerWrappedMode === 'public'}
												<div class="option-check"><Check /></div>
											{/if}
										</label>

										<label
											class="option-card"
											class:selected={selectedServerWrappedMode === 'private-oauth'}
										>
											<input
												type="radio"
												name="serverWrappedShareMode"
												value="private-oauth"
												bind:group={selectedServerWrappedMode}
											/>
											<div class="option-icon">
												<Lock />
											</div>
											<div class="option-content">
												<span class="option-title">Private OAuth</span>
												<span class="option-desc">Server members only</span>
											</div>
											{#if selectedServerWrappedMode === 'private-oauth'}
												<div class="option-check"><Check /></div>
											{/if}
										</label>
									</div>
								</div>

								<div class="panel-actions">
									<button type="submit" class="btn-primary" disabled={isSavingServerWrappedSettings}>
										{#if isSavingServerWrappedSettings}
											<Loader2 class="btn-icon spinning" />
											Saving…
										{:else}
											<Shield class="btn-icon" />
											Save Server Settings
										{/if}
									</button>
								</div>
							</div>
						</section>
					</form>

					<!-- Form 2: User Sharing Defaults (defaultShareMode + allowUserControl) -->
				<form
						method="POST"
						action="?/updateUserDefaults"
						use:enhance={() => {
							isSavingUserDefaults = true;
							return async ({ result, update }) => {
								try {
									if (result.type === 'success') {
										await update({ invalidateAll: true });
										await invalidateAll();
										return;
									}

									// Mirror the server-wide form: restore the controls, surface
									// the error, and refresh the OCC settingsVersion so retrying
									// isn't permanently locked into 409.
									restoreUserDefaults();
									await update();
									await invalidateAll();
								} finally {
									isSavingUserDefaults = false;
								}
							};
						}}
					>
					<input
						type="hidden"
						name="settingsVersion"
						value={data.userDefaultsSettingsVersion}
					/>

					<!-- User Sharing Defaults Section -->
					<section class="panel privacy-panel">
						<div class="panel-header">
							<div class="panel-title">
								<Users class="panel-icon" />
								<h2>User Sharing Defaults</h2>
							</div>
						</div>
							<p class="panel-description">
								Minimum privacy level for user wrapped pages. Users cannot choose less restrictive
								settings.
							</p>

							<div class="panel-form privacy-form-body">
								<div class="option-cards three-col">
									<label class="option-card" class:selected={selectedDefaultShareMode === 'public'}>
										<input
											type="radio"
											name="defaultShareMode"
											value="public"
											bind:group={selectedDefaultShareMode}
										/>
										<div class="option-icon">
											<Globe />
										</div>
										<div class="option-content">
											<span class="option-title">Public</span>
											<span class="option-desc">Least restrictive</span>
										</div>
										{#if selectedDefaultShareMode === 'public'}
											<div class="option-check"><Check /></div>
										{/if}
									</label>

									<label
										class="option-card"
										class:selected={selectedDefaultShareMode === 'private-link'}
									>
										<input
											type="radio"
											name="defaultShareMode"
											value="private-link"
											bind:group={selectedDefaultShareMode}
										/>
										<div class="option-icon">
											<Link />
										</div>
										<div class="option-content">
											<span class="option-title">Private Link</span>
											<span class="option-desc">Secret share link</span>
										</div>
										{#if selectedDefaultShareMode === 'private-link'}
											<div class="option-check"><Check /></div>
										{/if}
									</label>

									<label
										class="option-card"
										class:selected={selectedDefaultShareMode === 'private-oauth'}
									>
										<input
											type="radio"
											name="defaultShareMode"
											value="private-oauth"
											bind:group={selectedDefaultShareMode}
										/>
										<div class="option-icon">
											<Lock />
										</div>
										<div class="option-content">
											<span class="option-title">Private OAuth</span>
											<span class="option-desc">Most restrictive</span>
										</div>
										{#if selectedDefaultShareMode === 'private-oauth'}
											<div class="option-check"><Check /></div>
										{/if}
									</label>
								</div>

								<!-- User Control Toggle -->
								<div class="toggle-option">
									<label class="toggle-label">
										<input
											type="checkbox"
											name="allowUserControlCheckbox"
											bind:checked={allowUserControl}
										/>
										<span class="toggle-switch"></span>
										<span class="toggle-text">Allow users to control their own sharing settings</span>
									</label>
									<p class="toggle-hint">
										When enabled, users can adjust privacy but cannot go below the minimum set above.
									</p>
								</div>
								<input type="hidden" name="allowUserControl" value={allowUserControl.toString()} />

								<div class="panel-actions">
									<button type="submit" class="btn-primary" disabled={isSavingUserDefaults}>
										{#if isSavingUserDefaults}
											<Loader2 class="btn-icon spinning" />
											Saving…
										{:else}
											<Shield class="btn-icon" />
											Save User Defaults
										{/if}
									</button>
								</div>
							</div>
						</section>
					</form>

					<section class="panel privacy-panel privacy-bulk-panel">
						<div class="panel-header">
							<div class="panel-title">
								<Users class="panel-icon" />
								<h2>Apply Defaults to Existing Users</h2>
							</div>
						</div>
						<p class="panel-description">
							Reset existing user sharing records to the current defaults above. Future users receive
							these defaults automatically.
						</p>

						<div class="panel-form privacy-form-body">
							<div class="panel-actions secondary-actions">
								<button
									type="button"
									class="btn-secondary"
									disabled={isBulkApplyingUserControl}
									onclick={() => (bulkApplyShareDefaultsDialogOpen = true)}
								>
									{#if isBulkApplyingUserControl}
										<Loader2 class="btn-icon spinning" />
										Applying...
									{:else}
										<Users class="btn-icon" />
										Apply current defaults to all existing users
									{/if}
								</button>
							</div>
						</div>
					</section>
				</div>
			{/if}

		<!-- Security Tab -->
		{#if activeTab === 'security'}
			<div class="security-content">
					<!-- CSRF Protection Panel -->
					<section class="panel csrf-panel">
						<div class="panel-header">
							<div class="panel-title">
								<ShieldCheck class="panel-icon security" />
								<h2>CSRF Protection</h2>
								<button
									type="button"
									class="help-trigger"
									aria-label="Learn how CSRF protection works"
									aria-expanded={csrfHelpOpen}
									aria-controls="csrf-help-panel"
									onclick={() => (csrfHelpOpen = !csrfHelpOpen)}
								>
									<CircleHelp />
								</button>
							</div>
							<div class="connection-status" class:connected={data.security.csrfEnabled}>
								<span class="status-dot"></span>
								<span class="status-text">{data.security.csrfEnabled ? 'Enabled' : 'Disabled'}</span
								>
							</div>
						</div>

						<p class="panel-description">
							Cross-Site Request Forgery protection prevents malicious websites from making
							unauthorized requests on behalf of authenticated users.
						</p>
						{#if csrfHelpOpen}
							<div id="csrf-help-panel" class="security-help-panel">
								<strong>How CSRF Protection Works</strong>
								<p>
									When ORIGIN is set, Obzorarr validates that all state-changing requests
									(POST, PUT, PATCH, DELETE) originate from your domain. Combined with SameSite
									cookies, this provides robust protection without additional reverse proxy
									configuration.
								</p>
							</div>
						{/if}

						<div class="panel-form">
							<div class="form-field">
								<div class="field-header">
									<label for="csrfOrigin">ORIGIN</label>
									{#if csrfOriginLocked}
										<span class="env-lock-badge">
											<Lock class="badge-icon" />
											Set via environment variable
										</span>
									{:else if csrfOriginSource !== 'default'}
										<span class="source-badge" class:env={csrfOriginSource === 'env'}>
											{getSourceLabel(csrfOriginSource)}
										</span>
									{/if}
								</div>
								<div class="input-with-action">
									<input
										type="url"
										id="csrfOrigin"
										bind:value={csrfOriginValue}
										placeholder="https://your-domain.com"
										class:from-env={csrfOriginLocked}
										disabled={csrfOriginLocked}
									/>
									{#if !csrfOriginLocked}
										<button
											type="button"
											class="input-action"
											onclick={detectCurrentUrl}
											aria-label="Detect current URL"
											title="Auto-detect from current browser URL"
										>
											<Crosshair />
										</button>
									{/if}
								</div>
								{#if csrfOriginLocked}
									<span class="field-hint env-hint">
										This value is set via ORIGIN environment variable and cannot be changed here.
									</span>
								{:else}
									<span class="field-hint">
										Your application's public URL. Environment variable takes priority over
										database.
									</span>
								{/if}
							</div>

							<p class="csrf-actions-caption">
								Warning-reset controls appear when a CSRF warning is active.
							</p>
							{#if csrfOriginLocked}
								<div class="panel-info">
									<span class="info-text">
										CSRF origin is managed via environment variables
									</span>
								</div>
							{/if}

							<div class="panel-actions csrf-actions">
								{#if !csrfOriginLocked}
									<form
										method="POST"
										action="?/updateCsrfOrigin"
										use:enhance={() => {
											isSavingCsrf = true;
											return async ({ result, update }) => {
												try {
													// Don't reset the input on failure (incl. fail(409) confirmation
													// requirement) so the user can confirm without retyping.
													await update({ reset: result.type !== 'failure' });
												} finally {
													isSavingCsrf = false;
												}
											};
										}}
									>
										<input type="hidden" name="csrfOrigin" value={csrfOriginValue} />
										<input type="hidden" name="settingsVersion" value={data.csrfOriginVersion} />
										<button type="submit" class="btn-primary" disabled={isSavingCsrf}>
											{#if isSavingCsrf}
												<Loader2 class="btn-icon spinning" />
												Saving...
											{:else}
												<Check class="btn-icon" />
												Save CSRF Origin
											{/if}
										</button>
									</form>
								{/if}

								<form
									method="POST"
									action="?/testCsrfProtection"
									use:enhance={() => {
										isTestingCsrf = true;
										return async ({ update }) => {
											isTestingCsrf = false;
											await update();
										};
									}}
								>
									<button type="submit" class="btn-secondary" disabled={isTestingCsrf}>
										{#if isTestingCsrf}
											<Loader2 class="btn-icon spinning" />
											Testing...
										{:else}
											<ShieldCheck class="btn-icon" />
											Test CSRF Protection
										{/if}
									</button>
								</form>

								{#if !csrfOriginLocked && csrfOriginSource === 'db'}
									<button
										type="button"
										class="btn-destructive"
										onclick={() => (csrfClearDialogOpen = true)}
									>
										<X class="btn-icon" />
										Clear Database Value
									</button>
								{/if}

								{#if data.security.csrfOriginSkipped}
									<p class="field-hint" style="color: oklch(0.7065 0.186 48.13); width: 100%;">
										CSRF origin skip is currently <strong>active</strong>. Origin validation is
										relaxed — configure a proper ORIGIN when possible.
									</p>
								{/if}

								{#if data.security.csrfOriginSkipped}
									<p class="field-hint" style="color: oklch(var(--muted-foreground)); width: 100%;">
										To disable the CSRF skip, configure a CSRF origin above first.
									</p>
									<button type="button" class="btn-destructive" disabled>
										<ShieldAlert class="btn-icon" />
										Disable CSRF Skip
									</button>
								{:else if data.security.csrfEnabled}
									<p class="field-hint" style="color: oklch(var(--muted-foreground)); width: 100%;">
										CSRF is already enforced by the configured origin — skipping is not needed.
									</p>
									<button type="button" class="btn-secondary" disabled>
										<ShieldAlert class="btn-icon" />
										Enable CSRF Skip
									</button>
								{:else}
									<form
										method="POST"
										action="?/toggleCsrfSkip"
										use:enhance={() => {
											return async ({ result, update }) => {
												if (result.type === 'success' || result.type === 'failure') {
													handleFormToast(
														result.data as { success?: boolean; message?: string; error?: string }
													);
												}
												await update({ reset: false });
											};
										}}
									>
										<input type="hidden" name="enabled" value="true" />
										<button type="submit" class="btn-secondary">
											<ShieldAlert class="btn-icon" />
											Enable CSRF Skip
										</button>
									</form>
								{/if}

								{#if data.security.warningDismissed}
									<form
										method="POST"
										action="?/resetCsrfWarning"
										use:enhance={() => {
											isResettingCsrfWarning = true;
											return async ({ result, update }) => {
												isResettingCsrfWarning = false;
												if (result.type === 'success' || result.type === 'failure') {
													handleFormToast(
														result.data as { success?: boolean; message?: string; error?: string }
													);
												}
												await update({ reset: false });
											};
										}}
									>
										<button type="submit" class="btn-secondary" disabled={isResettingCsrfWarning}>
											{#if isResettingCsrfWarning}
												<Loader2 class="btn-icon spinning" />
												Resetting...
											{:else}
												<ShieldAlert class="btn-icon" />
												Re-enable CSRF Warning
											{/if}
										</button>
									</form>
								{/if}
							</div>
						</div>
					</section>

					<!-- TRUST_PROXY Panel -->
					<section class="panel csrf-panel">
						<div class="panel-header">
							<div class="panel-title">
								<ShieldCheck class="panel-icon security" />
								<h2>Reverse Proxy Header Trust</h2>
								<button
									type="button"
									class="help-trigger"
									aria-label="Learn how reverse-proxy header trust works"
									aria-expanded={trustProxyHelpOpen}
									aria-controls="trust-proxy-help-panel"
									onclick={() => (trustProxyHelpOpen = !trustProxyHelpOpen)}
								>
									<CircleHelp />
								</button>
							</div>
							<div class="connection-status" class:connected={trustProxyValue}>
								<span class="status-dot"></span>
								<span class="status-text">{trustProxyValue ? 'Trusted' : 'Disabled'}</span>
							</div>
						</div>

						<p class="panel-description">
							Use this when Obzorarr is behind a trusted proxy and the app needs to understand
							the public protocol and host your browser used. The diagnostic is read-only and
							never changes <code>TRUST_PROXY</code> by itself.
						</p>
						{#if trustProxyHelpOpen}
							<div id="trust-proxy-help-panel" class="security-help-panel">
								<strong>How Reverse-Proxy Header Trust Works</strong>
								<p>
									When enabled, Obzorarr trusts <code>X-Forwarded-Proto</code> and
									<code>X-Forwarded-Host</code> from the upstream proxy and uses them to build
									absolute URLs. Enable only if your reverse proxy strips inbound forwarded
									headers from clients; otherwise an attacker can poison the app's view of its own
									host and protocol.
								</p>
								<p>
									This commonly matters for Nginx Proxy Manager, Nginx, Caddy, Traefik, Pangolin,
									Tailscale/headscale, Docker bridge or host networking, LAN/private IP access,
									and localhost setups where the browser URL differs from Obzorarr's internal URL.
								</p>
							</div>
						{/if}

						<div class="panel-form">
							<div class="form-field">
								<div class="field-header">
									<label for="trustProxy">TRUST_PROXY</label>
									{#if trustProxyLocked}
										<span class="env-lock-badge">
											<Lock class="badge-icon" />
											Set via environment variable
										</span>
									{:else if trustProxySource !== 'default'}
										<span class="source-badge" class:env={trustProxySource === 'env'}>
											{getSourceLabel(trustProxySource)}
										</span>
									{/if}
								</div>
								{#if trustProxyLocked}
									<span class="field-hint env-hint">
										This value is set by the <code>TRUST_PROXY</code> environment variable. Change
										it in your environment, container, or compose configuration; the UI cannot
										override it.
									</span>
								{:else}
									<span class="field-hint">
										Leave this disabled for direct localhost or LAN access unless a trusted proxy
										sits in front of Obzorarr. Enable only if that proxy strips visitor-supplied
										<code>X-Forwarded-*</code> headers before forwarding requests.
									</span>
								{/if}
							</div>

							<div class="trust-proxy-diagnostic">
								<div class="diagnostic-header">
									<div>
										<h3>Connection Diagnostic</h3>
										<p>
											Compare the browser URL with what Obzorarr sees and with sanitized forwarded
											header signals.
										</p>
									</div>
									<button
										type="button"
										class="btn-secondary"
										onclick={runTrustProxyDiagnostic}
										disabled={isCheckingTrustProxyDiagnostic}
									>
										{#if isCheckingTrustProxyDiagnostic}
											<Loader2 class="btn-icon spinning" />
											Checking...
										{:else}
											<RefreshCw class="btn-icon" />
											Check again
										{/if}
									</button>
								</div>

								{#if trustProxyLocked}
									<div class="diagnostic-env-lock">
										<Lock class="diagnostic-inline-icon" />
										<span>
											<code>TRUST_PROXY</code> is locked by the environment and is currently
											{trustProxyValue ? 'enabled' : 'disabled'}. Update your environment or
											container configuration to change it.
										</span>
									</div>
								{/if}

								{#if isCheckingTrustProxyDiagnostic && !trustProxyDiagnostic}
									<div class="diagnostic-empty">
										<Loader2 class="btn-icon spinning" />
										Checking the current request path...
									</div>
								{:else if trustProxyDiagnosticError}
									<div class="diagnostic-error">
										<AlertTriangle class="diagnostic-inline-icon" />
										<span>{trustProxyDiagnosticError}</span>
									</div>
								{:else if trustProxyDiagnostic}
									<div class="diagnostic-result-grid">
										<section class="diagnostic-group">
											<h4>What your browser used</h4>
											<dl>
												<div>
													<dt>Browser origin</dt>
													<dd>{formatOrigin(trustProxyDiagnostic.origins.browser.origin)}</dd>
												</div>
												<div>
													<dt>Configured public origin</dt>
													<dd>
														{formatOrigin(trustProxyDiagnostic.origins.configuredPublic.origin)}
														<span class="diagnostic-muted">
															({getTrustProxySourceLabel(
																trustProxyDiagnostic.origins.configuredPublic.source
															)})
														</span>
													</dd>
												</div>
											</dl>
										</section>

										<section class="diagnostic-group">
											<h4>What Obzorarr sees</h4>
											<dl>
												<div>
													<dt>Raw app origin</dt>
													<dd>{formatOrigin(trustProxyDiagnostic.origins.rawApp)}</dd>
												</div>
												<div>
													<dt>Effective app origin</dt>
													<dd>{formatOrigin(trustProxyDiagnostic.origins.effectiveApp)}</dd>
												</div>
												<div>
													<dt>Source category</dt>
													<dd>{trustProxyDiagnostic.sourceAddress.category}</dd>
												</div>
												<div>
													<dt>Browser vs effective</dt>
													<dd>
														{formatComparison(
															trustProxyDiagnostic.originComparison.browserMatchesEffectiveApp
														)}
													</dd>
												</div>
											</dl>
										</section>

										<section class="diagnostic-group">
											<h4>Forwarded headers detected</h4>
											<dl>
												<div>
													<dt>Header names</dt>
													<dd>
														{trustProxyDiagnostic.forwardedHeaders.present.length > 0
															? trustProxyDiagnostic.forwardedHeaders.present.join(', ')
															: 'None detected'}
													</dd>
												</div>
												<div>
													<dt>Proto and host pair</dt>
													<dd>
														{getForwardedPairLabel(
															trustProxyDiagnostic.forwardedHeaders.pair.status
														)}
													</dd>
												</div>
												<div>
													<dt>Pair matches browser</dt>
													<dd>
														{formatComparison(
															trustProxyDiagnostic.originComparison.forwardedPairMatchesBrowser
														)}
													</dd>
												</div>
											</dl>
										</section>

										<section class="diagnostic-group diagnostic-recommendation">
											<h4>Recommendation</h4>
											<div class="recommendation-label">
												{getRecommendationLabel(trustProxyDiagnostic.recommendation.action)}
											</div>
											<p>{trustProxyDiagnostic.recommendation.summary}</p>
											{#if trustProxyDiagnostic.reasons.length > 0}
												<ul>
													{#each trustProxyDiagnostic.reasons as reason}
														<li>{reason}</li>
													{/each}
												</ul>
											{/if}
											<p class="safety-notice">{trustProxyDiagnostic.safetyNotice}</p>
										</section>
									</div>
								{:else}
									<div class="diagnostic-empty">
										Open the Security tab to run a diagnostic, or use Check again.
									</div>
								{/if}
							</div>

							{#if !trustProxyLocked}
								<div class="panel-actions csrf-actions">
									{#if trustProxyValue}
										<form
											method="POST"
											action="?/updateTrustProxy"
											use:enhance={() => {
												isSavingTrustProxy = true;
												return async ({ result, update }) => {
													try {
														if (result.type === 'success' || result.type === 'failure') {
															handleFormToast(
																result.data as {
																	success?: boolean;
																	message?: string;
																	error?: string;
																}
															);
														}
														await update({ reset: false });
													} finally {
														isSavingTrustProxy = false;
													}
												};
											}}
										>
											<input type="hidden" name="enabled" value="false" />
											<input
												type="hidden"
												name="settingsVersion"
												value={data.trustProxyVersion}
											/>
											<button type="submit" class="btn-destructive" disabled={isSavingTrustProxy}>
												{#if isSavingTrustProxy}
													<Loader2 class="btn-icon spinning" />
													Saving...
												{:else}
													<ShieldAlert class="btn-icon" />
													Disable Header Trust
												{/if}
											</button>
										</form>
									{:else}
										<button
											type="button"
											class="btn-primary"
											disabled={isConfirmingTrustProxy}
											onclick={() => (trustProxyConfirmDialogOpen = true)}
										>
											<ShieldCheck class="btn-icon" />
											Enable Header Trust
										</button>
									{/if}
								</div>
							{:else}
								<div class="panel-info">
									<span class="info-text">
										Reverse proxy header trust is managed via environment variables
									</span>
								</div>
							{/if}
						</div>
					</section>

					<!-- Reverse Proxy Documentation - Collapsible -->
					<div class="docs-collapsible">
						<button
							type="button"
							class="docs-toggle"
							onclick={() => (docsExpanded = !docsExpanded)}
							aria-expanded={docsExpanded}
						>
							<BookOpen class="docs-toggle-icon" />
							<span class="docs-toggle-text">Reverse Proxy Documentation</span>
							<span class="docs-chevron" class:expanded={docsExpanded}>
								<ChevronDown />
							</span>
						</button>

						{#if docsExpanded}
							<div class="docs-content">
								<p class="docs-hint">
									Ensure your reverse proxy forwards <code>X-Forwarded-*</code> headers correctly.
								</p>
								<div class="docs-links-inline">
									<a
										href="https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/"
										target="_blank"
										rel="noopener noreferrer"
									>
										Nginx
										<ExternalLink class="inline-link-icon" />
									</a>
									<span class="docs-separator">·</span>
									<a
										href="https://nginxproxymanager.com/advanced-config/"
										target="_blank"
										rel="noopener noreferrer"
									>
										NPM
										<ExternalLink class="inline-link-icon" />
									</a>
									<span class="docs-separator">·</span>
									<a
										href="https://httpd.apache.org/docs/2.4/howto/reverse_proxy.html"
										target="_blank"
										rel="noopener noreferrer"
									>
										Apache
										<ExternalLink class="inline-link-icon" />
									</a>
									<span class="docs-separator">·</span>
									<a
										href="https://caddyserver.com/docs/caddyfile/directives/reverse_proxy"
										target="_blank"
										rel="noopener noreferrer"
									>
										Caddy
										<ExternalLink class="inline-link-icon" />
									</a>
								</div>
							</div>
						{/if}
					</div>
			</div>
		{/if}

		<!-- Data Tab -->
		{#if activeTab === 'data'}
			<div class="data-content">
				<!-- Year & Archive Panel -->
				<section class="panel data-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Calendar class="panel-icon" />
							<h2>Year & Archive</h2>
						</div>
					</div>

					<div class="years-display">
						<div class="years-label">Available Years</div>
						<div class="years-list">
							{#each data.availableYears as year}
								<span class="year-badge">{year}</span>
							{:else}
								<span class="no-years">No data available</span>
							{/each}
						</div>
						<p class="years-hint">Years are automatically detected from play history data.</p>
					</div>

					<h3 class="subsection-title">
						<RefreshCw class="subsection-icon" />
						Clear Statistics Cache
					</h3>
					<p class="subsection-hint">Force recalculation of statistics by clearing the cache.</p>

					<div class="panel-actions action-buttons">
						{#each data.availableYears as year}
							<button
								type="button"
								class="btn-secondary"
								onclick={() => getCacheCount(year)}
								disabled={loadingCount}
							>
								{#if loadingCount && pendingCacheYear === year}
									<Loader2 class="btn-icon spinning" />
								{:else}
									<Database class="btn-icon" />
								{/if}
								Get {year} Count
							</button>
							<button
								type="button"
								class="btn-secondary"
								onclick={() => showCacheConfirmation(year)}
								disabled={loadingCount}
							>
								{#if loadingCount && pendingCacheYear === year}
									<Loader2 class="btn-icon spinning" />
								{:else}
									<RefreshCw class="btn-icon" />
								{/if}
								Clear {year}
							</button>
						{/each}
						<button
							type="button"
							class="btn-secondary btn-all"
							onclick={() => getCacheCount()}
							disabled={loadingCount}
						>
							{#if loadingCount && pendingCacheYear === undefined}
								<Loader2 class="btn-icon spinning" />
							{:else}
								<Database class="btn-icon" />
							{/if}
							Get All Cache Count
						</button>
						<button
							type="button"
							class="btn-secondary btn-all"
							onclick={() => showCacheConfirmation()}
							disabled={loadingCount}
						>
							{#if loadingCount && pendingCacheYear === undefined}
								<Loader2 class="btn-icon spinning" />
							{:else}
								<RefreshCw class="btn-icon" />
							{/if}
							Clear All Cache
						</button>
					</div>
					{#if cacheCountResult}
						<p
							bind:this={cacheCountResultElement}
							class="count-result"
							role="status"
							aria-live="polite"
							tabindex="-1"
						>
							{cacheCountResult.label}: {formatRecordCount(cacheCountResult.count)}
						</p>
					{/if}
				</section>

				<!-- Danger Zone -->
				<section class="panel danger-panel">
					<div class="panel-header danger">
						<div class="panel-title">
							<AlertTriangle class="panel-icon danger" />
							<h2>Danger Zone</h2>
						</div>
					</div>

					<div class="danger-warning">
						<AlertTriangle class="warning-icon" />
						<div class="warning-content">
							<strong>Destructive Action</strong>
							<p>
								Deleting play history is permanent and cannot be undone. Related statistics cache
								will also be cleared.
							</p>
						</div>
					</div>

					<h3 class="subsection-title danger">
						<Trash2 class="subsection-icon" />
						Delete Play History
					</h3>
					<p class="subsection-hint">
						Permanently remove viewing history for a specific year or all years.
					</p>

					<div class="panel-actions action-buttons danger">
						{#each data.availableYears as year}
							<button
								type="button"
								class="btn-secondary"
								onclick={() => getHistoryCount(year)}
								disabled={loadingHistoryCount}
							>
								{#if loadingHistoryCount && pendingHistoryYear === year}
									<Loader2 class="btn-icon spinning" />
								{:else}
									<Database class="btn-icon" />
								{/if}
								Get {year} Count
							</button>
							<button
								type="button"
								class="btn-danger"
								onclick={() => showHistoryConfirmation(year)}
								disabled={loadingHistoryCount}
							>
								{#if loadingHistoryCount && pendingHistoryYear === year}
									<Loader2 class="btn-icon spinning" />
								{:else}
									<Trash2 class="btn-icon" />
								{/if}
								Delete {year}
							</button>
						{/each}
						<button
							type="button"
							class="btn-secondary btn-all"
							onclick={() => getHistoryCount()}
							disabled={loadingHistoryCount}
						>
							{#if loadingHistoryCount && pendingHistoryYear === undefined}
								<Loader2 class="btn-icon spinning" />
							{:else}
								<Database class="btn-icon" />
							{/if}
							Get All History Count
						</button>
						<button
							type="button"
							class="btn-danger btn-all"
							onclick={() => showHistoryConfirmation()}
							disabled={loadingHistoryCount}
						>
							{#if loadingHistoryCount && pendingHistoryYear === undefined}
								<Loader2 class="btn-icon spinning" />
							{:else}
								<Trash2 class="btn-icon" />
							{/if}
							Delete All History
						</button>
					</div>
					{#if historyCountResult}
						<p
							bind:this={historyCountResultElement}
							class="count-result"
							role="status"
							aria-live="polite"
							tabindex="-1"
						>
							{historyCountResult.label}: {formatRecordCount(historyCountResult.count)}
						</p>
					{/if}
				</section>
			</div>
		{/if}

		<!-- System Tab -->
		{#if activeTab === 'system'}
			<div class="system-content">
				<section class="panel system-panel">
					<div class="panel-header">
						<div class="panel-title">
							<ScrollText class="panel-icon" />
							<h2>Logging</h2>
						</div>
						<a href="/admin/logs" class="panel-link">
							<ExternalLink class="link-icon" />
							View Logs
						</a>
					</div>
					<p class="panel-description">Configure log retention and debug settings.</p>

					<form
						method="POST"
						action="?/updateLogSettings"
						use:enhance={() => {
							isSavingLogSettings = true;
							return async ({ result, update }) => {
								try {
									if (result.type === 'success') {
										await update({ invalidateAll: true });
										await invalidateAll();
										return;
									}

									await update();
									// Only restore server-truth when the failure does not
									// carry per-field errors. On Zod validation failures we
									// keep the user's invalid input visible so the field
									// errors line up with what they typed.
									const hasFieldErrors =
										result.type === 'failure' &&
										result.data != null &&
										typeof result.data === 'object' &&
										'fieldErrors' in result.data;
									if (!hasFieldErrors) {
										restoreLogSettings();
									}
								} finally {
									isSavingLogSettings = false;
								}
							};
						}}
						class="panel-form"
					>
						<div class="form-row">
							<div class="form-field">
								<div class="field-header">
									<label for="retentionDays">
										<Clock class="field-icon" />
										Retention Period
									</label>
								</div>
								<div class="input-with-suffix">
									<input
										type="number"
										id="retentionDays"
										name="retentionDays"
										bind:value={logRetentionDays}
										min="1"
										max="365"
									/>
									<span class="input-suffix">days</span>
								</div>
								{#if logFieldErrors?.retentionDays?.[0]}
									<span class="field-error">{logFieldErrors.retentionDays[0]}</span>
								{/if}
								<span class="field-hint">Auto-delete logs older than this (1-365)</span>
							</div>

							<div class="form-field">
								<div class="field-header">
									<label for="maxCount">
										<Hash class="field-icon" />
										Maximum Count
									</label>
								</div>
								<div class="input-with-suffix">
									<input
										type="number"
										id="maxCount"
										name="maxCount"
										bind:value={logMaxCount}
										min="1000"
										max="1000000"
										step="1"
									/>
									<span class="input-suffix">logs</span>
								</div>
								{#if logFieldErrors?.maxCount?.[0]}
									<span class="field-error">{logFieldErrors.maxCount[0]}</span>
								{/if}
								<span class="field-hint">Maximum logs to retain</span>
							</div>
						</div>

						<div class="toggle-option">
							<label class="toggle-label">
								<input type="checkbox" name="debugEnabledCheckbox" bind:checked={logDebugEnabled} />
								<span class="toggle-switch"></span>
								<span class="toggle-text">
									<Bug class="toggle-icon" />
									Enable DEBUG level logging
								</span>
							</label>
							<p class="toggle-hint">
								Detailed debug logs will be recorded. May generate a large volume of logs.
							</p>
						</div>
						<input type="hidden" name="debugEnabled" value={logDebugEnabled.toString()} />
						<input type="hidden" name="settingsVersion" value={data.logSettingsVersion} />

						<div class="panel-actions">
							<button type="submit" class="btn-primary" disabled={isSavingLogSettings}>
								{#if isSavingLogSettings}
									<Loader2 class="btn-icon spinning" />
									Saving…
								{:else}
									<Check class="btn-icon" />
									Save Logging Settings
								{/if}
							</button>
						</div>
					</form>
				</section>

				<section class="panel system-panel">
					<div class="panel-header">
						<div class="panel-title">
							<Monitor class="panel-icon" />
							<h2>System</h2>
						</div>
					</div>
					<p class="panel-description">Read-only runtime information for the current process.</p>

					<dl class="system-info-grid">
						<div class="system-info-item">
							<dt>App version</dt>
							<dd>{data.appVersion.display}</dd>
						</div>
						<div class="system-info-item">
							<dt>Uptime</dt>
							<dd>{formatUptime(data.systemInfo.uptimeSeconds)}</dd>
						</div>
						<div class="system-info-item">
							<dt>OS / arch</dt>
							<dd>{data.systemInfo.osPlatform} / {data.systemInfo.osArch}</dd>
						</div>
						<div class="system-info-item">
							<dt>Bun version</dt>
							<dd>{data.systemInfo.bunVersion ?? 'Unknown'}</dd>
						</div>
					</dl>
				</section>
			</div>
		{/if}
	</div>
</div>

<!-- Cache Clearing Dialog -->
<AlertDialog.Root bind:open={cacheDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{pendingCacheYear !== undefined ? `Clear ${pendingCacheYear} Cache?` : 'Clear All Cache?'}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{getCacheConfirmationMessage()}
				<br /><br />
				Statistics will be recalculated on next access.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isClearing}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearCache"
				use:enhance={() => {
					isClearing = true;
					return async ({ update }) => {
						await update();
						isClearing = false;
						handleCacheCleared();
					};
				}}
				style="display: contents;"
			>
				{#if pendingCacheYear !== undefined}
					<input type="hidden" name="year" value={pendingCacheYear} />
				{/if}
				<AlertDialog.Action type="submit" disabled={isClearing}>
					{#if isClearing}
						Clearing...
					{:else}
						Clear {pendingCacheCount} Record{pendingCacheCount !== 1 ? 's' : ''}
					{/if}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Play History Dialog -->
<AlertDialog.Root bind:open={historyDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{pendingHistoryYear !== undefined
					? `Delete ${pendingHistoryYear} Play History?`
					: 'Delete All Play History?'}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{getHistoryConfirmationMessage()}
				<br /><br />
				<strong>This action cannot be undone.</strong> Statistics cache for affected years will also be
				cleared.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isClearingHistory}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearPlayHistory"
				use:enhance={() => {
					isClearingHistory = true;
					return async ({ update }) => {
						await update();
						isClearingHistory = false;
						handleHistoryCleared();
					};
				}}
				style="display: contents;"
			>
				{#if pendingHistoryYear !== undefined}
					<input type="hidden" name="year" value={pendingHistoryYear} />
				{/if}
				<AlertDialog.Action type="submit" disabled={isClearingHistory} class="destructive-action">
					{#if isClearingHistory}
						Deleting...
					{:else}
						Delete {pendingHistoryCount} Record{pendingHistoryCount !== 1 ? 's' : ''}
					{/if}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- CSRF Clear Dialog -->
<AlertDialog.Root bind:open={csrfClearDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Clear CSRF Origin?</AlertDialog.Title>
			<AlertDialog.Description>
				This will remove the CSRF origin value from the database. If no ORIGIN environment variable
				is set and the CSRF skip flag is not enabled, all admin POST requests will be rejected
				(fail-closed). The server will block this action in that case.
				<br /><br />
				You can reconfigure this setting at any time.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isClearingCsrf}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/clearCsrfOrigin"
				use:enhance={() => {
					isClearingCsrf = true;
					return async ({ update }) => {
						await update();
						isClearingCsrf = false;
						csrfClearDialogOpen = false;
					};
				}}
				style="display: contents;"
			>
				<AlertDialog.Action type="submit" disabled={isClearingCsrf} class="destructive-action">
					{#if isClearingCsrf}
						Clearing...
					{:else}
						Clear CSRF Origin
					{/if}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- CSRF Mismatch Confirmation Dialog -->
<AlertDialog.Root bind:open={csrfMismatchDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Confirm risky CSRF change</AlertDialog.Title>
			<AlertDialog.Description>
				{(form as { csrfMismatchMessage?: string } | null | undefined)?.csrfMismatchMessage ??
					'Saving this CSRF origin may lock you out of admin POST operations.'}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel
				disabled={isConfirmingCsrfMismatch}
				onclick={() => {
					csrfMismatchDialogOpen = false;
					pendingCsrfOrigin = null;
				}}
			>
				Cancel
			</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/updateCsrfOrigin"
				use:enhance={() => {
					isConfirmingCsrfMismatch = true;
					return async ({ update }) => {
						try {
							await update({ reset: false });
						} finally {
							isConfirmingCsrfMismatch = false;
							csrfMismatchDialogOpen = false;
							pendingCsrfOrigin = null;
						}
					};
				}}
				style="display: contents;"
			>
				<input type="hidden" name="csrfOrigin" value={pendingCsrfOrigin ?? ''} />
				<input type="hidden" name="confirmMismatch" value="true" />
				<input type="hidden" name="settingsVersion" value={data.csrfOriginVersion} />
				<AlertDialog.Action type="submit" disabled={isConfirmingCsrfMismatch}>
					{isConfirmingCsrfMismatch ? 'Saving…' : 'Save anyway'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<!-- Reverse Proxy Header Trust Confirmation Dialog -->
<AlertDialog.Root bind:open={trustProxyConfirmDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Enable reverse-proxy header trust?</AlertDialog.Title>
			<AlertDialog.Description>
				Only enable this when your upstream proxy strips client-supplied
				<code>X-Forwarded-*</code> headers before forwarding requests to Obzorarr. If those
				headers can reach Obzorarr from clients, attackers can spoof the host or protocol used for
				security decisions and generated URLs.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isConfirmingTrustProxy}>Cancel</AlertDialog.Cancel>
			<form
				method="POST"
				action="?/updateTrustProxy"
				use:enhance={() => {
					isConfirmingTrustProxy = true;
					return async ({ result, update }) => {
						try {
							if (result.type === 'success' || result.type === 'failure') {
								handleFormToast(
									result.data as {
										success?: boolean;
										message?: string;
										error?: string;
									}
								);
							}
							await update({ reset: false });
						} finally {
							isConfirmingTrustProxy = false;
							trustProxyConfirmDialogOpen = false;
						}
					};
				}}
				style="display: contents;"
			>
				<input type="hidden" name="enabled" value="true" />
				<input type="hidden" name="confirmRisk" value="true" />
				<input type="hidden" name="settingsVersion" value={data.trustProxyVersion} />
				<AlertDialog.Action type="submit" disabled={isConfirmingTrustProxy}>
					{isConfirmingTrustProxy ? 'Enabling...' : 'Enable header trust'}
				</AlertDialog.Action>
			</form>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={bulkApplyShareDefaultsDialogOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Apply current defaults to all users?</AlertDialog.Title>
			<AlertDialog.Description>
				This resets every existing user's share mode and "can control" setting back to the current
				server defaults. Per-user customizations will be lost. Future users continue to receive
				the current defaults.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel disabled={isBulkApplyingUserControl}>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				disabled={isBulkApplyingUserControl}
				onclick={confirmBulkApplyShareDefaults}
			>
				{isBulkApplyingUserControl ? 'Applying…' : 'Apply to all users'}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<style>
	/* ===== Base Layout ===== */
		.settings-command-center {
			max-width: 1000px;
			margin: 0 auto;
			padding: 1.5rem 2rem 3rem;
		}

		/* ===== Page Header ===== */
		.page-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 1.5rem;
			padding-bottom: 1.5rem;
			border-bottom: 1px solid oklch(var(--border));
		}

		.header-content {
			display: flex;
			align-items: center;
			gap: 1rem;
		}

		.header-icon {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 56px;
			height: 56px;
			background: linear-gradient(135deg, oklch(var(--primary) / 0.15), oklch(var(--primary) / 0.05));
			border: 1px solid oklch(var(--primary) / 0.3);
			border-radius: 16px;
			color: oklch(var(--primary));
		}

		.header-icon :global(svg) {
			width: 28px;
			height: 28px;
		}

		.header-text h1 {
			font-size: 1.75rem;
			font-weight: 700;
			color: oklch(var(--foreground));
			margin: 0;
			letter-spacing: -0.02em;
		}

		.header-subtitle {
			font-size: 0.875rem;
			color: oklch(var(--muted-foreground));
			margin: 0.25rem 0 0;
		}

		/* ===== Tab Navigation ===== */
		.tab-nav {
			display: flex;
			gap: 0.5rem;
			padding: 0.5rem;
			background: oklch(var(--muted) / 0.3);
			border-radius: 12px;
			margin-bottom: 1.5rem;
			overflow-x: auto;
		}

		.tab-button {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.75rem 1.25rem;
			/* WCAG 2.1 SC 2.5.5 floor — keeps the vertical hit-area at 44px
			   even when the active tab pill shrinks under wider viewports. */
			min-height: var(--min-tap-size);
			background: transparent;
			border: none;
			border-radius: 8px;
			color: oklch(var(--muted-foreground));
			font-size: 0.875rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.2s ease;
			white-space: nowrap;
		}

		.tab-button:hover {
			color: oklch(var(--foreground));
			background: oklch(var(--muted) / 0.5);
		}

		.tab-button.active {
			color: oklch(var(--primary-foreground));
			background: oklch(var(--primary));
			box-shadow: 0 2px 8px oklch(var(--primary) / 0.3);
		}

		.tab-icon {
			width: 18px;
			height: 18px;
		}

		/* ===== Panel Base ===== */
		.panel {
			background: oklch(var(--card));
			border: 1px solid oklch(var(--border));
			border-radius: 16px;
			overflow: hidden;
			margin-bottom: 1.5rem;
		}

		.panel-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 1rem 1.25rem;
			border-bottom: 1px solid oklch(var(--border));
			background: oklch(var(--muted) / 0.3);
		}

		.panel-title {
			display: flex;
			align-items: center;
			gap: 0.625rem;
		}

		.panel-title h2 {
			font-size: 1rem;
			font-weight: 600;
			color: oklch(var(--foreground));
			margin: 0;
		}

		.panel-icon {
			width: 20px;
			height: 20px;
			color: oklch(var(--primary));
		}

		.panel-icon.plex {
			color: oklch(0.8408 0.1725 84.2);
		}

		.panel-icon.openai {
			color: oklch(0.7551 0.1452 165.37);
		}

		.panel-icon.danger {
			color: oklch(0.5714 0.2121 27.25);
		}

		.panel-description {
			color: oklch(var(--muted-foreground));
			font-size: 0.875rem;
			margin: 0;
			padding: 1rem 1.25rem 0;
		}

		.panel-form {
			padding: 1.25rem;
		}

		.panel-actions {
			display: flex;
			justify-content: flex-end;
			align-items: center;
			gap: 0.75rem;
			flex-wrap: wrap;
			margin-top: 1.25rem;
			padding-top: 1rem;
			border-top: 1px solid oklch(var(--border) / 0.5);
		}

		.plex-actions {
			justify-content: flex-end;
		}

		.panel-badge {
			font-size: 0.6875rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			padding: 0.25rem 0.625rem;
			border-radius: 6px;
			background: oklch(var(--muted));
			color: oklch(var(--muted-foreground));
		}

		.panel-badge.optional {
			background: oklch(0.3424 0.0573 233.83);
			color: oklch(0.7828 0.0764 230.66);
		}

		.panel-link {
			display: flex;
			align-items: center;
			gap: 0.375rem;
			font-size: 0.8125rem;
			color: oklch(var(--primary));
			text-decoration: none;
			transition: opacity 0.15s ease;
		}

		.panel-link:hover {
			opacity: 0.8;
		}

		.link-icon {
			width: 14px;
			height: 14px;
		}

		/* ===== Connection Status ===== */
		.connection-status {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			padding: 0.375rem 0.75rem;
			background: oklch(var(--muted));
			border-radius: 20px;
			font-size: 0.75rem;
		}

		.status-dot {
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: oklch(var(--muted-foreground));
		}

		.connection-status.connected .status-dot {
			background: oklch(0.7776 0.199 151.21);
			box-shadow: 0 0 8px oklch(0.7776 0.199 151.21 / 0.5);
		}

		.status-text {
			color: oklch(var(--muted-foreground));
		}

		.connection-status.connected .status-text {
			color: oklch(0.7776 0.199 151.21);
		}

		/* ===== Form Fields ===== */
		.form-field {
			margin-bottom: 1rem;
		}

		.field-header {
			display: flex;
			align-items: flex-start;
			flex-wrap: wrap;
			gap: 0.25rem 0.5rem;
			min-height: 1.5rem;
			margin-bottom: 0.5rem;
		}

		.field-header label {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.8125rem;
			font-weight: 500;
			color: oklch(var(--foreground));
		}

		.field-icon {
			width: 16px;
			height: 16px;
			color: oklch(var(--muted-foreground));
		}

		.form-field input {
			width: 100%;
			padding: 0.625rem 0.875rem;
			background: oklch(var(--input));
			border: 1px solid oklch(var(--border));
			border-radius: 8px;
			color: oklch(var(--foreground));
			font-size: 0.875rem;
			transition: all 0.15s ease;
		}

		.form-field input:focus {
			outline: none;
			border-color: oklch(var(--ring));
			box-shadow: 0 0 0 3px oklch(var(--ring) / 0.15);
		}

		.form-field input.from-env {
			border-color: oklch(0.5096 0.1483 253.46 / 0.4);
			background: oklch(0.5987 0.1773 253.7 / 0.05);
		}

		.field-hint {
			display: block;
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
			margin-top: 0.375rem;
		}

		.checkbox-row {
			display: flex;
			align-items: center;
			gap: 0.625rem;
			margin: -0.25rem 0 1rem;
			font-size: 0.8125rem;
			color: oklch(var(--foreground));
		}

		.checkbox-row input {
			width: 1rem;
			height: 1rem;
			accent-color: oklch(var(--primary));
		}

		.field-error {
			display: block;
			font-size: 0.75rem;
			color: oklch(var(--destructive));
			margin-top: 0.375rem;
		}

		.system-info-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
			gap: 1rem;
			margin: 0;
			padding: 0;
		}

		.system-info-item {
			background: oklch(var(--muted) / 0.4);
			border: 1px solid oklch(var(--border));
			border-radius: var(--radius);
			padding: 0.875rem 1rem;
		}

		.system-info-item dt {
			font-size: 0.7rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: oklch(var(--muted-foreground));
			margin: 0 0 0.25rem;
		}

		.system-info-item dd {
			margin: 0;
			font-size: 0.9rem;
			font-weight: 600;
			color: oklch(var(--foreground));
			word-break: break-word;
		}

		.source-badge {
			font-size: 0.625rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.03em;
			padding: 0.125rem 0.5rem;
			border-radius: 4px;
			background: oklch(0.4353 0.0951 151.26);
			color: oklch(0.7662 0.1373 152.72);
		}

		.source-badge.env {
			background: oklch(0.3681 0.1016 252.83);
			color: oklch(0.708 0.1276 250.07);
		}

		/* Environment Lock Badge - indicates ENV-controlled settings */
		.env-lock-badge {
			display: inline-flex;
			align-items: center;
			gap: 0.375rem;
			padding: 0.25rem 0.625rem;
			background: linear-gradient(135deg, oklch(0.3653 0.0908 251.82), oklch(0.3146 0.066 250.72));
			border: 1px solid oklch(0.4566 0.1043 251.21);
			border-radius: 6px;
			font-size: 0.6875rem;
			font-weight: 600;
			color: oklch(0.7478 0.1093 249.48);
			letter-spacing: 0.02em;
		}

		.env-lock-badge :global(.badge-icon) {
			width: 12px;
			height: 12px;
		}

		/* Locked input styling */
		.form-field input:read-only,
		.form-field input:disabled {
			background: oklch(var(--muted) / 0.3);
			border-color: oklch(0.4566 0.1043 251.21 / 0.4);
			color: oklch(var(--muted-foreground));
			cursor: not-allowed;
			opacity: 0.8;
		}

		.field-hint.env-hint {
			color: oklch(0.6673 0.1116 249.83);
			font-style: italic;
		}

		/* Panel info message (when all fields are locked) */
		.panel-info {
			margin-top: 1.25rem;
			padding: 1rem;
			background: oklch(0.5883 0.1391 251.44 / 0.08);
			border: 1px dashed oklch(0.4566 0.1043 251.21 / 0.4);
			border-radius: 8px;
			text-align: center;
		}

		.panel-info .info-text {
			font-size: 0.8125rem;
			color: oklch(0.6673 0.1116 249.83);
			font-style: italic;
		}

		.inline-result,
		.count-result {
			margin-top: 1rem;
			padding: 0.75rem 1rem;
			border: 1px solid oklch(0.5516 0.1244 150.96 / 0.45);
			border-radius: 8px;
			background: oklch(0.4943 0.11 151.09 / 0.12);
			color: oklch(0.8209 0.1049 154.29);
			font-size: 0.875rem;
		}

		.inline-result.error {
			border-color: oklch(var(--destructive) / 0.45);
			background: oklch(var(--destructive) / 0.1);
			color: oklch(var(--destructive));
		}

		.input-with-action {
			display: flex;
			gap: 0.5rem;
		}

		.input-with-action input {
			flex: 1;
		}

		.input-action {
			display: flex;
			align-items: center;
			justify-content: center;
			/* WCAG 2.1 SC 2.5.5 floor — was 42px wide with no min-height,
			   so the rendered hit-area was 42×(input height). Lift to 44×44
			   minimum so the show/hide secret and clear-input affordances
			   pass touch-target audits. */
			min-width: var(--min-tap-size);
			min-height: var(--min-tap-size);
			padding: 0 0.5rem;
			background: oklch(var(--muted));
			border: 1px solid oklch(var(--border));
			border-radius: 8px;
			color: oklch(var(--muted-foreground));
			cursor: pointer;
			transition: all 0.15s ease;
		}

		.input-action:hover {
			background: oklch(var(--secondary));
			color: oklch(var(--foreground));
		}

		.input-action :global(svg) {
			width: 18px;
			height: 18px;
		}

		.input-action:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.input-with-suffix {
			display: flex;
			align-items: stretch;
		}

		.input-with-suffix input {
			border-top-right-radius: 0;
			border-bottom-right-radius: 0;
			border-right: none;
		}

		.input-suffix {
			display: flex;
			align-items: center;
			padding: 0 0.875rem;
			background: oklch(var(--muted));
			border: 1px solid oklch(var(--border));
			border-left: none;
			border-radius: 0 8px 8px 0;
			font-size: 0.8125rem;
			color: oklch(var(--muted-foreground));
		}

		.form-row {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 1.5rem;
			align-items: start;
		}

		.form-row .form-field {
			min-width: 0;
			margin-bottom: 0;
		}

		.form-row .form-field input {
			width: 100%;
			max-width: 100%;
			box-sizing: border-box;
		}

		/* ===== Buttons ===== */
		.btn-primary {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			padding: 0.625rem 1.25rem;
			background: oklch(var(--primary));
			color: oklch(var(--primary-foreground));
			border: none;
			border-radius: 8px;
			font-size: 0.875rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.15s ease;
		}

		.btn-primary:hover {
			opacity: 0.9;
			transform: translateY(-1px);
		}

		.btn-primary:disabled {
			opacity: 0.5;
			cursor: not-allowed;
			transform: none;
		}

		.btn-secondary {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			padding: 0.5rem 1rem;
			background: oklch(var(--secondary));
			color: oklch(var(--foreground));
			border: 1px solid oklch(var(--border));
			border-radius: 8px;
			font-size: 0.8125rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.15s ease;
		}

		.btn-secondary:hover:not(:disabled) {
			background: oklch(var(--muted));
			border-color: oklch(var(--primary) / 0.5);
		}

		.btn-secondary:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.btn-danger {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			padding: 0.5rem 1rem;
			background: oklch(var(--secondary));
			color: oklch(var(--foreground));
			border: 1px solid oklch(var(--border));
			border-radius: 8px;
			font-size: 0.8125rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.15s ease;
		}

		.btn-danger:hover:not(:disabled) {
			background: oklch(0.5288 0.1952 27.16);
			color: white;
			border-color: oklch(0.5288 0.1952 27.16);
		}

		.btn-danger:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.btn-destructive {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
			padding: 0.5rem 1rem;
			background: oklch(0.3437 0.1092 24.99);
			color: oklch(0.7089 0.1324 20.95);
			border: 1px solid oklch(0.4287 0.1227 23.86);
			border-radius: 8px;
			font-size: 0.8125rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.15s ease;
		}

		.btn-destructive:hover:not(:disabled) {
			background: oklch(0.5288 0.1952 27.16);
			color: white;
			border-color: oklch(0.5288 0.1952 27.16);
		}

		.btn-destructive:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}

		.btn-icon {
			width: 16px;
			height: 16px;
		}

		.btn-all {
			font-weight: 600;
		}

		.openai-maintenance-row {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;
			margin: 0 1.25rem 1.25rem;
			padding: 0.875rem 1rem;
			background: oklch(var(--muted) / 0.35);
			border: 1px solid oklch(var(--border));
			border-radius: 10px;
		}

		.openai-maintenance-copy {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			min-width: 0;
		}

		.maintenance-title {
			font-size: 0.8125rem;
			font-weight: 600;
			color: oklch(var(--foreground));
		}

		.maintenance-description {
			font-size: 0.75rem;
			line-height: 1.4;
			color: oklch(var(--muted-foreground));
		}

		.openai-maintenance-actions {
			display: flex;
			flex-wrap: wrap;
			justify-content: flex-end;
			gap: 0.5rem;
			flex-shrink: 0;
		}

		.openai-maintenance-form {
			display: inline-flex;
			margin: 0;
		}

		.spinning {
			animation: spin 1s linear infinite;
		}

		@keyframes spin {
			to {
				transform: rotate(360deg);
			}
		}

		/* ===== Content Grid ===== */
		.content-grid {
			display: grid;
			gap: 1.5rem;
		}

		/* ===== Theme Grid ===== */
		.theme-panel {
			padding-bottom: 0;
		}

		.theme-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
			gap: 0.875rem;
		}

		.theme-card {
			position: relative;
			display: flex;
			flex-direction: column;
			align-items: center;
			padding: 1rem 0.75rem;
			background: oklch(var(--muted) / 0.5);
			border: 2px solid oklch(var(--border));
			border-radius: 12px;
			cursor: pointer;
			transition: all 0.2s ease;
		}

		.theme-card:hover {
			border-color: oklch(var(--primary) / 0.5);
			transform: translateY(-2px);
		}

		.theme-card.selected {
			border-color: oklch(var(--primary));
			background: oklch(var(--primary) / 0.1);
		}

		.theme-card input {
			position: absolute;
			opacity: 0;
			pointer-events: none;
		}

		.theme-preview {
			width: 56px;
			height: 56px;
			border-radius: 50%;
			margin-bottom: 0.625rem;
			border: 2px solid oklch(var(--border));
			overflow: hidden;
			position: relative;
		}

		.theme-gradient {
			position: absolute;
			inset: 0;
		}

		.theme-preview.modern-minimal .theme-gradient {
			background: linear-gradient(135deg, #5b6ef5 50%, #3d4db7 50%);
		}

		.theme-preview.supabase .theme-gradient {
			background: linear-gradient(135deg, #3ecf8e 50%, #24b47e 50%);
		}

		.theme-preview.doom-64 .theme-gradient {
			background: linear-gradient(135deg, #d97706 50%, #92400e 50%);
		}

		.theme-preview.amber-minimal .theme-gradient {
			background: linear-gradient(135deg, #f59e0b 50%, #d97706 50%);
		}

		.theme-preview.soviet-red .theme-gradient {
			background: linear-gradient(135deg, #cc0000 50%, #8b0000 50%);
		}

		.theme-name {
			font-size: 0.75rem;
			font-weight: 500;
			color: oklch(var(--foreground));
			text-align: center;
		}

		.theme-check {
			position: absolute;
			top: 0.5rem;
			right: 0.5rem;
			width: 20px;
			height: 20px;
			background: oklch(var(--primary));
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			color: oklch(var(--primary-foreground));
		}

		.theme-check :global(svg) {
			width: 12px;
			height: 12px;
		}

		/* ===== Option Cards ===== */
		.option-cards {
			display: grid;
			grid-template-columns: repeat(3, 1fr);
			gap: 0.75rem;
			margin-bottom: 1.5rem;
		}

		.option-cards.two-col {
			grid-template-columns: repeat(2, 1fr);
		}

		.option-cards.three-col {
			grid-template-columns: repeat(3, 1fr);
		}

		.option-card {
			position: relative;
			display: flex;
			flex-direction: column;
			align-items: center;
			text-align: center;
			padding: 1rem 0.75rem;
			background: oklch(var(--muted) / 0.5);
			border: 2px solid oklch(var(--border));
			border-radius: 12px;
			cursor: pointer;
			transition: all 0.2s ease;
		}

		.option-card:hover {
			border-color: oklch(var(--primary) / 0.5);
			background: oklch(var(--muted) / 0.8);
		}

		.option-card.selected {
			border-color: oklch(var(--primary));
			background: oklch(var(--primary) / 0.1);
		}

		.option-card input {
			position: absolute;
			opacity: 0;
			pointer-events: none;
		}

		.option-icon {
			width: 40px;
			height: 40px;
			display: flex;
			align-items: center;
			justify-content: center;
			background: oklch(var(--secondary));
			border-radius: 10px;
			margin-bottom: 0.625rem;
			color: oklch(var(--muted-foreground));
			transition: all 0.2s ease;
		}

		.option-card.selected .option-icon {
			background: oklch(var(--primary) / 0.2);
			color: oklch(var(--primary));
		}

		.option-icon :global(svg) {
			width: 20px;
			height: 20px;
		}

		.option-content {
			flex: 1;
		}

		.option-title {
			display: block;
			font-size: 0.875rem;
			font-weight: 600;
			color: oklch(var(--foreground));
			margin-bottom: 0.25rem;
		}

		.option-desc {
			display: block;
			font-size: 0.7rem;
			color: oklch(var(--muted-foreground));
			line-height: 1.4;
		}

		.option-check {
			position: absolute;
			top: 0.5rem;
			right: 0.5rem;
			width: 20px;
			height: 20px;
			background: oklch(var(--primary));
			border-radius: 50%;
			display: flex;
			align-items: center;
			justify-content: center;
			color: oklch(var(--primary-foreground));
		}

		.option-check :global(svg) {
			width: 12px;
			height: 12px;
		}

		/* ===== Subsections ===== */
		.subsection-title {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.9375rem;
			font-weight: 600;
			color: oklch(var(--foreground));
			margin: 1.5rem 0 0.5rem;
			padding: 0 1.25rem;
		}

		.subsection-title:first-of-type {
			margin-top: 1rem;
		}

		.subsection-title.danger {
			color: oklch(0.5714 0.2121 27.25);
		}

		.subsection-icon {
			width: 18px;
			height: 18px;
			color: oklch(var(--muted-foreground));
		}

		.subsection-hint {
			font-size: 0.8125rem;
			color: oklch(var(--muted-foreground));
			margin: 0 0 1rem;
			padding: 0 1.25rem;
		}

		.panel-description code {
			padding: 0.125rem 0.375rem;
			background: oklch(var(--muted));
			border-radius: 4px;
			font-size: 0.75rem;
		}

			.privacy-form-body {
				display: flex;
				flex-direction: column;
				gap: 1.25rem;
			}

			.privacy-setting-group + .privacy-setting-group {
				padding-top: 1.25rem;
				border-top: 1px solid oklch(var(--border) / 0.5);
			}

			.privacy-form-body .subsection-title {
				margin: 0 0 0.5rem;
				padding: 0;
			}

			.privacy-form-body .subsection-hint {
				margin: 0 0 1rem;
				padding: 0;
			}

			.privacy-form-body .toggle-option {
				margin: 0;
			}

			.privacy-bulk-panel .secondary-actions {
				justify-content: flex-start;
				margin-top: 0;
				padding-top: 0;
				border-top: 0;
			}

		/* ===== Toggle Option ===== */
		.toggle-option {
			margin: 1rem 1.25rem;
			padding: 1rem;
			background: oklch(var(--secondary));
			border-radius: 10px;
			border: 1px solid oklch(var(--border));
		}

		.toggle-label {
			display: flex;
			align-items: center;
			gap: 0.75rem;
			cursor: pointer;
		}

		.toggle-label input {
			position: absolute;
			opacity: 0;
			pointer-events: none;
		}

		.toggle-switch {
			position: relative;
			box-sizing: border-box;
			width: 44px;
			height: 24px;
			background: oklch(var(--muted) / 0.5);
			border: 1px solid oklch(var(--muted-foreground) / 0.4);
			border-radius: 12px;
			transition: all 0.2s ease;
			flex-shrink: 0;
		}

		.toggle-switch::after {
			content: '';
			position: absolute;
			top: 1px;
			left: 1px;
			width: 20px;
			height: 20px;
			background: oklch(var(--foreground));
			border-radius: 50%;
			transition: transform 0.2s ease;
		}

		.toggle-label input:checked + .toggle-switch {
			background: oklch(var(--primary));
			border-color: oklch(var(--primary));
		}

		.toggle-label input:checked + .toggle-switch::after {
			transform: translateX(20px);
		}

		.toggle-text {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.875rem;
			font-weight: 500;
			color: oklch(var(--foreground));
		}

		.toggle-icon {
			width: 16px;
			height: 16px;
			color: oklch(var(--muted-foreground));
		}

		.toggle-hint {
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
			margin: 0.5rem 0 0 3.25rem;
		}

		/* ===== Years Display ===== */
		.years-display {
			padding: 1.25rem;
			background: oklch(var(--muted) / 0.3);
			margin: 1rem 1.25rem;
			border-radius: 10px;
		}

		.years-label {
			font-size: 0.75rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.05em;
			color: oklch(var(--muted-foreground));
			margin-bottom: 0.75rem;
		}

		.years-list {
			display: flex;
			flex-wrap: wrap;
			gap: 0.5rem;
			margin-bottom: 0.75rem;
		}

		.year-badge {
			padding: 0.375rem 0.875rem;
			background: oklch(var(--primary) / 0.15);
			color: oklch(var(--primary));
			border-radius: 6px;
			font-size: 0.875rem;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
		}

		.no-years {
			color: oklch(var(--muted-foreground));
			font-style: italic;
			font-size: 0.875rem;
		}

		.years-hint {
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
			margin: 0;
		}

		/* ===== Action Buttons ===== */
		.action-buttons {
			justify-content: flex-start;
			padding: 1rem 1.25rem 1.25rem;
		}

		.action-buttons.danger {
			padding-top: 1rem;
		}

		/* ===== Danger Panel ===== */
		.danger-panel {
			border-color: oklch(0.476 0.159 25.64 / 0.4);
			background: oklch(0.5594 0.19 25.86 / 0.03);
		}

		.panel-header.danger {
			background: oklch(0.5594 0.19 25.86 / 0.1);
			border-bottom-color: oklch(0.476 0.159 25.64 / 0.3);
		}

		.panel-header.danger h2 {
			color: oklch(0.5972 0.1977 25.52);
		}

		/* Destructive Action Warning Callout - Subordinate to main header */
		.danger-warning {
			position: relative;
			display: flex;
			align-items: flex-start;
			gap: 0.875rem;
			margin: 1rem 1.25rem;
			padding: 0.875rem 1rem 0.875rem 1.125rem;
			background: oklch(0.5523 0.1637 24.21 / 0.04);
			border: 1px dashed oklch(0.5119 0.1503 24.12 / 0.25);
			border-left: none;
			border-radius: 0 8px 8px 0;
			overflow: hidden;
		}

		/* Left accent stripe with hazard pattern */
		.danger-warning::before {
			content: '';
			position: absolute;
			left: 0;
			top: 0;
			bottom: 0;
			width: 4px;
			background: repeating-linear-gradient(
				-45deg,
				oklch(0.5714 0.2121 27.25),
				oklch(0.5714 0.2121 27.25) 4px,
				oklch(0.8408 0.1725 84.2) 4px,
				oklch(0.8408 0.1725 84.2) 8px
			);
		}

		/* Subtle inner glow effect */
		.danger-warning::after {
			content: '';
			position: absolute;
			left: 4px;
			top: 0;
			bottom: 0;
			width: 40px;
			background: linear-gradient(90deg, oklch(0.5714 0.2121 27.25 / 0.08), transparent);
			pointer-events: none;
		}

		.warning-icon {
			position: relative;
			z-index: 1;
			width: 18px;
			height: 18px;
			color: oklch(0.7981 0.1577 78.37);
			flex-shrink: 0;
			margin-top: 0.125rem;
		}

		.warning-content {
			position: relative;
			z-index: 1;
			flex: 1;
		}

		.warning-content strong {
			display: inline-flex;
			align-items: center;
			gap: 0.375rem;
			font-size: 0.6875rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.08em;
			color: oklch(0.8094 0.1437 81.08);
			background: oklch(0.7355 0.1423 79.13 / 0.12);
			padding: 0.1875rem 0.5rem;
			border-radius: 3px;
			margin-bottom: 0.375rem;
		}

		.warning-content p {
			font-size: 0.8125rem;
			color: oklch(var(--muted-foreground));
			margin: 0;
			line-height: 1.5;
		}

		/* ===== AlertDialog Styling ===== */
		:global(.destructive-action) {
			background-color: oklch(0.5288 0.1952 27.16) !important;
			color: white !important;
		}

		:global(.destructive-action:hover) {
			background-color: oklch(0.4854 0.178 27.04) !important;
		}

		/* ===== Security Tab ===== */
		.security-content {
			display: grid;
			gap: 1.5rem;
		}

		/* CSRF Panel - Shield icon with security green accent */
		.csrf-panel {
			position: relative;
		}

		.csrf-panel::before {
			content: '';
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			height: 3px;
			background: linear-gradient(
				90deg,
				oklch(0.7189 0.1831 151.3) 0%,
				oklch(0.7934 0.1859 152.72) 50%,
				oklch(0.6983 0.1337 165.46) 100%
			);
			border-radius: 16px 16px 0 0;
			opacity: 0.8;
		}

		.csrf-panel :global(.panel-icon.security) {
			color: oklch(0.7776 0.199 151.21);
		}

		/* CSRF actions layout */
		.csrf-actions {
			justify-content: flex-start;
			margin-top: 1rem;
		}

		.csrf-actions-caption {
			margin: 1rem 0 0;
			font-size: 0.8rem;
			color: oklch(var(--muted-foreground));
		}

		.help-trigger {
			all: unset;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			color: oklch(var(--muted-foreground) / 0.4);
			transition: color 0.2s ease;
		}

		.help-trigger:hover {
			color: oklch(var(--muted-foreground) / 0.75);
		}

		.help-trigger:focus-visible {
			color: oklch(0.6273 0.1256 250.49);
		}

		.help-trigger :global(svg) {
			width: 15px;
			height: 15px;
		}

		.security-help-panel {
			margin: 0.75rem 0 1.25rem;
			padding: 0.875rem 1rem;
			border: 1px solid oklch(var(--border) / 0.65);
			border-radius: 8px;
			background: oklch(var(--muted) / 0.25);
			color: oklch(var(--muted-foreground));
			font-size: 0.875rem;
			line-height: 1.55;
		}

		.security-help-panel strong {
			display: block;
			margin-bottom: 0.35rem;
			color: oklch(var(--foreground));
			font-size: 0.875rem;
		}

		.security-help-panel p {
			margin: 0 0 0.625rem;
		}

		.security-help-panel p:last-child {
			margin-bottom: 0;
		}

		.trust-proxy-diagnostic {
			margin-top: 1.25rem;
			padding: 1rem;
			border: 1px solid oklch(var(--border) / 0.7);
			border-radius: 8px;
			background: oklch(var(--muted) / 0.16);
		}

		.diagnostic-header {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 1rem;
			margin-bottom: 1rem;
		}

		.diagnostic-header h3 {
			margin: 0;
			color: oklch(var(--foreground));
			font-size: 0.9375rem;
			font-weight: 600;
		}

		.diagnostic-header p {
			margin: 0.25rem 0 0;
			color: oklch(var(--muted-foreground));
			font-size: 0.8125rem;
			line-height: 1.45;
		}

		.diagnostic-env-lock,
		.diagnostic-error,
		.diagnostic-empty {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			margin-bottom: 1rem;
			padding: 0.75rem 0.875rem;
			border-radius: 8px;
			font-size: 0.8125rem;
			line-height: 1.45;
		}

		.diagnostic-env-lock {
			border: 1px solid oklch(0.4566 0.1043 251.21 / 0.45);
			background: oklch(0.5883 0.1391 251.44 / 0.08);
			color: oklch(0.7495 0.0828 248.98);
		}

		.diagnostic-error {
			border: 1px solid oklch(0.4854 0.178 27.04 / 0.45);
			background: oklch(0.5288 0.1952 27.16 / 0.12);
			color: oklch(0.7265 0.1228 20.51);
		}

		.diagnostic-empty {
			margin-bottom: 0;
			border: 1px dashed oklch(var(--border) / 0.7);
			background: oklch(var(--background) / 0.35);
			color: oklch(var(--muted-foreground));
		}

		.diagnostic-inline-icon {
			width: 15px;
			height: 15px;
			flex: 0 0 auto;
		}

		.diagnostic-result-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.875rem;
		}

		.diagnostic-group {
			padding: 0.875rem;
			border: 1px solid oklch(var(--border) / 0.55);
			border-radius: 8px;
			background: oklch(var(--background) / 0.4);
		}

		.diagnostic-group h4 {
			margin: 0 0 0.75rem;
			color: oklch(var(--foreground));
			font-size: 0.8125rem;
			font-weight: 600;
		}

		.diagnostic-group dl {
			display: grid;
			gap: 0.625rem;
			margin: 0;
		}

		.diagnostic-group dt {
			color: oklch(var(--muted-foreground));
			font-size: 0.6875rem;
			font-weight: 600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
		}

		.diagnostic-group dd {
			margin: 0.125rem 0 0;
			color: oklch(var(--foreground));
			font-size: 0.8125rem;
			line-height: 1.45;
			overflow-wrap: anywhere;
		}

		.diagnostic-muted {
			color: oklch(var(--muted-foreground));
		}

		.diagnostic-recommendation {
			border-color: oklch(0.7189 0.1831 151.3 / 0.35);
			background: oklch(0.5975 0.1502 151.55 / 0.1);
		}

		.recommendation-label {
			display: inline-flex;
			margin-bottom: 0.5rem;
			padding: 0.25rem 0.625rem;
			border-radius: 999px;
			background: oklch(0.4401 0.0997 153.19);
			color: oklch(0.8591 0.1257 156.85);
			font-size: 0.75rem;
			font-weight: 700;
		}

		.diagnostic-recommendation p {
			margin: 0 0 0.625rem;
			color: oklch(var(--foreground));
			font-size: 0.8125rem;
			line-height: 1.5;
		}

		.diagnostic-recommendation ul {
			margin: 0 0 0.625rem;
			padding-left: 1.1rem;
			color: oklch(var(--muted-foreground));
			font-size: 0.78125rem;
			line-height: 1.45;
		}

		.diagnostic-recommendation .safety-notice {
			margin-bottom: 0;
			color: oklch(0.8888 0.1215 91.38);
		}

		/* Documentation - Compact Collapsible */
		.docs-collapsible {
			border-radius: 10px;
			overflow: hidden;
		}

		.docs-toggle {
			display: flex;
			align-items: center;
			gap: 0.625rem;
			width: 100%;
			padding: 0.75rem 1rem;
			background: oklch(var(--muted) / 0.25);
			border: 1px solid oklch(var(--border) / 0.6);
			border-radius: 10px;
			color: oklch(var(--muted-foreground));
			font-size: 0.8125rem;
			font-weight: 500;
			cursor: pointer;
			transition: all 0.2s ease;
		}

		.docs-toggle:hover {
			background: oklch(var(--muted) / 0.4);
			color: oklch(var(--foreground));
			border-color: oklch(var(--border));
		}

		.docs-toggle :global(.docs-toggle-icon) {
			width: 15px;
			height: 15px;
			opacity: 0.6;
		}

		.docs-toggle-text {
			flex: 1;
			text-align: left;
		}

		.docs-chevron {
			display: flex;
			align-items: center;
			justify-content: center;
			opacity: 0.5;
			transition: transform 0.2s ease;
		}

		.docs-chevron :global(svg) {
			width: 16px;
			height: 16px;
		}

		.docs-chevron.expanded {
			transform: rotate(180deg);
		}

		.docs-content {
			padding: 0.875rem 1rem;
			background: oklch(var(--muted) / 0.15);
			border: 1px solid oklch(var(--border) / 0.6);
			border-top: none;
			border-radius: 0 0 10px 10px;
			margin-top: -1px;
		}

		.docs-hint {
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
			margin: 0 0 0.75rem;
			line-height: 1.5;
		}

		.docs-hint code {
			padding: 0.125rem 0.375rem;
			background: oklch(var(--muted) / 0.6);
			border-radius: 4px;
			font-size: 0.6875rem;
			font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
		}

		.docs-links-inline {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.5rem;
		}

		.docs-links-inline a {
			display: inline-flex;
			align-items: center;
			gap: 0.25rem;
			color: oklch(var(--primary));
			text-decoration: none;
			font-size: 0.8125rem;
			font-weight: 500;
			transition: opacity 0.15s ease;
		}

		.docs-links-inline a:hover {
			opacity: 0.75;
		}

		.docs-links-inline :global(.inline-link-icon) {
			width: 11px;
			height: 11px;
			opacity: 0.7;
		}

		.docs-separator {
			color: oklch(var(--muted-foreground) / 0.4);
			font-size: 0.75rem;
			user-select: none;
		}

		/* ===== Responsive ===== */
		@media (max-width: 768px) {
			.settings-command-center {
				padding: 1rem 1rem 2rem;
			}

			.page-header {
				flex-direction: column;
				align-items: flex-start;
				gap: 1rem;
			}

			.tab-nav {
				gap: 0.25rem;
				padding: 0.375rem;
			}

			.tab-button {
				padding: 0.625rem 1rem;
				font-size: 0.8125rem;
			}

			.tab-label {
				display: none;
			}

			.form-row {
				grid-template-columns: 1fr;
			}

			.openai-maintenance-row {
				align-items: flex-start;
				flex-direction: column;
			}

			.openai-maintenance-actions {
				justify-content: flex-start;
			}

			.theme-grid {
				grid-template-columns: repeat(2, 1fr);
			}

			.option-cards,
			.option-cards.two-col,
			.option-cards.three-col {
				grid-template-columns: repeat(2, 1fr);
			}

			.diagnostic-header {
				flex-direction: column;
			}

			.diagnostic-result-grid {
				grid-template-columns: 1fr;
			}
		}

		@media (max-width: 480px) {
			.tab-button {
				padding: 0.5rem 0.75rem;
			}

			.theme-grid {
				grid-template-columns: repeat(2, 1fr);
				gap: 0.625rem;
			}

			.theme-preview {
				width: 44px;
				height: 44px;
			}

			.option-cards,
			.option-cards.two-col,
			.option-cards.three-col {
				grid-template-columns: 1fr;
			}

			.option-card {
				flex-direction: row;
				text-align: left;
				gap: 1rem;
				padding: 1rem;
			}

			.option-icon {
				margin-bottom: 0;
			}

			.option-check {
				position: static;
				margin-left: auto;
			}

			.openai-maintenance-actions,
			.openai-maintenance-form,
			.openai-maintenance-form button {
				width: 100%;
			}

			.diagnostic-header button {
				width: 100%;
			}
		}

		/* CSRF Tooltip - Global styles for portal-rendered content */
		:global(.csrf-tooltip) {
			max-width: 320px !important;
			padding: 0.875rem 1rem !important;
			background: oklch(var(--popover)) !important;
			border: 1px solid oklch(var(--border)) !important;
			border-radius: 10px !important;
			box-shadow:
				0 4px 12px oklch(0 0 0 / 0.15),
				0 2px 4px oklch(0 0 0 / 0.1) !important;
		}

		:global(.csrf-tooltip-inner) {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
		}

		:global(.csrf-tooltip-inner strong) {
			font-size: 0.8125rem;
			font-weight: 600;
			color: oklch(var(--foreground));
			letter-spacing: 0.01em;
		}

		:global(.csrf-tooltip-inner p) {
			font-size: 0.75rem;
			color: oklch(var(--muted-foreground));
			line-height: 1.55;
			margin: 0;
		}
</style>
