import { Buffer } from 'node:buffer';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { AppSettingsKey, getAppSetting, setAppSetting } from '$lib/server/admin/settings.service';
import { checkServerWrappedAccess, checkWrappedAccess } from '$lib/server/sharing/access-control';
import { getGlobalDefaultShareMode, getOrCreateShareSettings } from '$lib/server/sharing/service';
import {
	getMoreRestrictiveMode,
	InvalidShareTokenError,
	ShareAccessDeniedError,
	ShareMode
} from '$lib/server/sharing/types';

const TOKEN_VERSION = 1;
const TOKEN_TTL_SECONDS = 30 * 60;
const ALLOWED_THUMB_PATH = /^library\/metadata\/\d+\/thumb\/\d+$/;

type ThumbnailKind = 'server' | 'user';

interface ThumbnailTokenPayload {
	v: typeof TOKEN_VERSION;
	path: string;
	exp: number;
	kind: ThumbnailKind;
	year: number;
	userId?: number;
	shareTokenHash?: string;
}

export type ThumbnailSigningContext =
	| {
			kind: 'server';
			year: number;
	  }
	| {
			kind: 'user';
			year: number;
			userId: number;
			shareToken?: string;
	  };

function base64UrlEncode(value: string | Buffer): string {
	return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value: string): Buffer {
	return Buffer.from(value, 'base64url');
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('base64url');
}

async function getSigningSecret(): Promise<string> {
	const existing = await getAppSetting(AppSettingsKey.THUMBNAIL_SIGNING_SECRET);
	if (existing) {
		return existing;
	}

	const generated = randomBytes(32).toString('base64url');
	await setAppSetting(AppSettingsKey.THUMBNAIL_SIGNING_SECRET, generated);
	return generated;
}

function signPayload(encodedPayload: string, secret: string): string {
	return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function normalizePlexThumbPath(thumb: string): string | null {
	let path = thumb;

	if (path.startsWith('/plex/thumb/')) {
		path = path.slice('/plex/thumb/'.length);
	} else if (path.startsWith('/')) {
		path = path.slice(1);
	} else {
		return null;
	}

	const queryStart = path.indexOf('?');
	if (queryStart >= 0) {
		path = path.slice(0, queryStart);
	}

	return ALLOWED_THUMB_PATH.test(path) ? path : null;
}

async function createThumbnailToken(payload: ThumbnailTokenPayload): Promise<string> {
	const secret = await getSigningSecret();
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));
	const signature = signPayload(encodedPayload, secret);
	return `${encodedPayload}.${signature}`;
}

export async function verifyThumbnailToken(
	token: string | null
): Promise<ThumbnailTokenPayload | null> {
	if (!token) return null;

	const [encodedPayload, signature] = token.split('.');
	if (!encodedPayload || !signature) return null;

	const secret = await getSigningSecret();
	const expected = signPayload(encodedPayload, secret);
	const actualBuffer = Buffer.from(signature);
	const expectedBuffer = Buffer.from(expected);
	if (
		actualBuffer.length !== expectedBuffer.length ||
		!timingSafeEqual(actualBuffer, expectedBuffer)
	) {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
	} catch {
		return null;
	}

	if (!isThumbnailTokenPayload(parsed)) {
		return null;
	}

	if (parsed.exp <= Math.floor(Date.now() / 1000)) {
		return null;
	}

	return parsed;
}

function isThumbnailTokenPayload(value: unknown): value is ThumbnailTokenPayload {
	if (typeof value !== 'object' || value === null) return false;
	const payload = value as Record<string, unknown>;
	return (
		payload.v === TOKEN_VERSION &&
		typeof payload.path === 'string' &&
		ALLOWED_THUMB_PATH.test(payload.path) &&
		typeof payload.exp === 'number' &&
		(payload.kind === 'server' || payload.kind === 'user') &&
		typeof payload.year === 'number' &&
		(payload.kind === 'server' || typeof payload.userId === 'number') &&
		(payload.shareTokenHash === undefined || typeof payload.shareTokenHash === 'string')
	);
}

export async function createSignedThumbnailUrl(
	thumb: string | null | undefined,
	context: ThumbnailSigningContext
): Promise<string | null> {
	if (!thumb) return null;

	const path = normalizePlexThumbPath(thumb);
	if (!path) {
		return thumb;
	}

	const payload: ThumbnailTokenPayload = {
		v: TOKEN_VERSION,
		path,
		exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
		kind: context.kind,
		year: context.year
	};

	if (context.kind === 'user') {
		payload.userId = context.userId;
		if (context.shareToken) {
			payload.shareTokenHash = hashToken(context.shareToken);
		}
	}

	const token = await createThumbnailToken(payload);
	return `/plex/thumb/${path}?token=${encodeURIComponent(token)}`;
}

export async function signStatsThumbnails<T>(
	stats: T,
	context: ThumbnailSigningContext
): Promise<T> {
	const clone = structuredClone(stats);
	await rewriteThumbs(clone, context);
	return clone;
}

async function rewriteThumbs(value: unknown, context: ThumbnailSigningContext): Promise<void> {
	if (Array.isArray(value)) {
		for (const item of value) {
			await rewriteThumbs(item, context);
		}
		return;
	}

	if (typeof value !== 'object' || value === null) {
		return;
	}

	const record = value as Record<string, unknown>;
	for (const [key, nested] of Object.entries(record)) {
		if (key === 'thumb' && (typeof nested === 'string' || nested === null)) {
			record[key] = await createSignedThumbnailUrl(nested, context);
			continue;
		}

		await rewriteThumbs(nested, context);
	}
}

export async function authorizeThumbnailPayload(
	payload: ThumbnailTokenPayload,
	locals: App.Locals
): Promise<void> {
	try {
		if (payload.kind === 'server') {
			await checkServerWrappedAccess({ year: payload.year, currentUser: locals.user });
			return;
		}

		if (!payload.userId) {
			error(403, { message: 'Invalid thumbnail token' });
		}

		if (payload.shareTokenHash) {
			const settings = await getOrCreateShareSettings({
				userId: payload.userId,
				year: payload.year
			});
			const globalFloor = await getGlobalDefaultShareMode();
			const effectiveMode = getMoreRestrictiveMode(settings.mode, globalFloor);

			if (
				effectiveMode !== ShareMode.PRIVATE_LINK ||
				!settings.shareToken ||
				hashToken(settings.shareToken) !== payload.shareTokenHash
			) {
				error(403, { message: 'Thumbnail access denied' });
			}
			return;
		}

		await checkWrappedAccess({
			userId: payload.userId,
			year: payload.year,
			currentUser: locals.user
		});
	} catch (err) {
		if (err instanceof ShareAccessDeniedError || err instanceof InvalidShareTokenError) {
			error(403, { message: 'Thumbnail access denied' });
		}
		throw err;
	}
}
