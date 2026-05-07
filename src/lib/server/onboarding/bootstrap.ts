import type { Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
	AppSettingsKey,
	deleteAppSetting,
	getAppSetting,
	getCsrfOrigin,
	setAppSetting
} from '$lib/server/admin/settings.service';

const BOOTSTRAP_TOKEN_TTL_MS = 15 * 60 * 1000;
const CLAIM_TTL_SECONDS = 10 * 60;
const CLAIM_TTL_MS = CLAIM_TTL_SECONDS * 1000;
const TOKEN_LENGTH = 14;
const TOKEN_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export const ONBOARDING_CLAIM_COOKIE = 'obzorarr_onboarding_claim';
export const ONBOARDING_CLAIM_REQUIRED_MESSAGE =
	'Setup claim required. Open the Obzorarr server console, claim this setup session, and try again.';

interface BootstrapToken {
	value: string;
	expiresAt: number;
}

let activeBootstrapToken: BootstrapToken | null = null;
let bannerPrinted = false;
let bootstrapBannerPromise: Promise<void> | null = null;
let onboardingCompletedCached = false;

export interface OnboardingClaimCookieContext {
	requestUrl?: URL;
}

export class OnboardingClaimRequiredError extends Error {
	constructor(message = ONBOARDING_CLAIM_REQUIRED_MESSAGE) {
		super(message);
		this.name = 'OnboardingClaimRequiredError';
	}
}

function randomTokenChar(): string {
	const maxValid = Math.floor(256 / TOKEN_ALPHABET.length) * TOKEN_ALPHABET.length;
	const bytes = new Uint8Array(1);

	while (true) {
		crypto.getRandomValues(bytes);
		const value = bytes[0];
		if (value !== undefined && value < maxValid) {
			return TOKEN_ALPHABET[value % TOKEN_ALPHABET.length] ?? 'a';
		}
	}
}

export function generateBootstrapToken(): string {
	const chars = Array.from({ length: 12 }, randomTokenChar);
	return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars
		.slice(8, 12)
		.join('')}`;
}

export function createBootstrapToken(ttlMs = BOOTSTRAP_TOKEN_TTL_MS): string {
	const value = generateBootstrapToken();
	activeBootstrapToken = {
		value,
		expiresAt: Date.now() + ttlMs
	};
	return value;
}

export function clearBootstrapToken(): void {
	activeBootstrapToken = null;
	bannerPrinted = false;
	bootstrapBannerPromise = null;
	onboardingCompletedCached = false;
}

export function isBootstrapTokenExpired(): boolean {
	if (!activeBootstrapToken) return true;
	if (Date.now() >= activeBootstrapToken.expiresAt) {
		activeBootstrapToken = null;
		bannerPrinted = false;
		return true;
	}
	return false;
}

function timingSafeEqualString(left: string, right: string): boolean {
	const leftBytes = new TextEncoder().encode(left);
	const rightBytes = new TextEncoder().encode(right);
	if (leftBytes.length !== rightBytes.length) return false;

	let diff = 0;
	for (let i = 0; i < leftBytes.length; i++) {
		diff |= (leftBytes[i] ?? 0) ^ (rightBytes[i] ?? 0);
	}
	return diff === 0;
}

export function validateBootstrapToken(candidate: string): boolean {
	if (!activeBootstrapToken || isBootstrapTokenExpired()) return false;
	if (candidate.length !== TOKEN_LENGTH) return false;
	return timingSafeEqualString(candidate, activeBootstrapToken.value);
}

function getOrCreateBootstrapToken(): string {
	if (activeBootstrapToken && !isBootstrapTokenExpired()) {
		return activeBootstrapToken.value;
	}
	return createBootstrapToken();
}

async function printBootstrapBanner(): Promise<void> {
	if (onboardingCompletedCached) return;
	if (bannerPrinted && !isBootstrapTokenExpired()) return;
	if ((await getAppSetting(AppSettingsKey.ONBOARDING_COMPLETED)) === 'true') {
		onboardingCompletedCached = true;
		activeBootstrapToken = null;
		return;
	}

	const token = getOrCreateBootstrapToken();
	const origin = await getCsrfOrigin();
	const setupUrl = origin ? `${origin.replace(/\/+$/, '')}/onboarding/claim` : '/onboarding/claim';

	console.info('');
	console.info('Obzorarr initial setup requires a bootstrap claim.');
	console.info(`Setup URL: ${setupUrl}`);
	console.info(`Bootstrap token: ${token}`);
	console.info('This token expires in 15 minutes and is not stored.');
	console.info('');
	bannerPrinted = true;
}

export async function printOnboardingBootstrapBanner(): Promise<void> {
	if (onboardingCompletedCached) return;
	if (bannerPrinted && !isBootstrapTokenExpired()) return;

	if (!bootstrapBannerPromise) {
		bootstrapBannerPromise = printBootstrapBanner();
	}

	try {
		await bootstrapBannerPromise;
	} finally {
		bootstrapBannerPromise = null;
	}
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

function createClaimProof(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

function shouldSecureClaimCookie(context: OnboardingClaimCookieContext = {}): boolean {
	if (dev) return false;
	if (context.requestUrl) return context.requestUrl.protocol === 'https:';
	return true;
}

function setClaimCookie(
	cookies: Cookies,
	proof: string,
	context: OnboardingClaimCookieContext = {}
): void {
	cookies.set(ONBOARDING_CLAIM_COOKIE, proof, {
		path: '/',
		httpOnly: true,
		secure: shouldSecureClaimCookie(context),
		sameSite: 'strict',
		maxAge: CLAIM_TTL_SECONDS
	});
}

export function clearOnboardingClaimCookie(cookies: Cookies): void {
	cookies.delete(ONBOARDING_CLAIM_COOKIE, { path: '/' });
}

async function getActiveStoredClaimHash(): Promise<string | null> {
	const [claimed, proofHash, claimedAt] = await Promise.all([
		getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED),
		getAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH),
		getAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT)
	]);

	if (claimed !== 'true' || !proofHash || !claimedAt) return null;

	const claimedAtMs = Number(claimedAt);
	if (!Number.isFinite(claimedAtMs) || Date.now() - claimedAtMs > CLAIM_TTL_MS) {
		return null;
	}

	return proofHash;
}

export async function hasAnyActiveOnboardingClaim(): Promise<boolean> {
	return (await getActiveStoredClaimHash()) !== null;
}

export async function hasActiveOnboardingClaim(cookies: Cookies): Promise<boolean> {
	const proof = cookies.get(ONBOARDING_CLAIM_COOKIE);
	if (!proof) return false;

	const storedHash = await getActiveStoredClaimHash();
	if (!storedHash) return false;

	const cookieHash = await sha256Hex(proof);
	return timingSafeEqualString(cookieHash, storedHash);
}

export async function renewOnboardingClaim(
	cookies: Cookies,
	context: OnboardingClaimCookieContext = {}
): Promise<boolean> {
	const proof = cookies.get(ONBOARDING_CLAIM_COOKIE);
	if (!proof || !(await hasActiveOnboardingClaim(cookies))) return false;

	await setAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT, String(Date.now()));
	setClaimCookie(cookies, proof, context);
	return true;
}

export async function requireActiveOnboardingClaim(
	cookies: Cookies,
	context: OnboardingClaimCookieContext = {}
): Promise<void> {
	if (!(await renewOnboardingClaim(cookies, context))) {
		throw new OnboardingClaimRequiredError();
	}
}

export async function claimOnboardingInstance(
	cookies: Cookies,
	token: string,
	context: OnboardingClaimCookieContext = {}
): Promise<'claimed' | 'renewed' | 'already-claimed' | 'invalid-token'> {
	if (await renewOnboardingClaim(cookies, context)) {
		return 'renewed';
	}

	if (await hasAnyActiveOnboardingClaim()) {
		return 'already-claimed';
	}

	if (!validateBootstrapToken(token)) {
		return 'invalid-token';
	}

	const proof = createClaimProof();
	await Promise.all([
		setAppSetting(AppSettingsKey.ONBOARDING_CLAIMED, 'true'),
		setAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH, await sha256Hex(proof)),
		setAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT, String(Date.now()))
	]);
	setClaimCookie(cookies, proof, context);
	return 'claimed';
}

export async function clearOnboardingClaim(): Promise<void> {
	await Promise.all([
		deleteAppSetting(AppSettingsKey.ONBOARDING_CLAIMED),
		deleteAppSetting(AppSettingsKey.ONBOARDING_CLAIM_PROOF_HASH),
		deleteAppSetting(AppSettingsKey.ONBOARDING_CLAIMED_AT)
	]);
	clearBootstrapToken();
}
