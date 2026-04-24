import { beforeEach, describe, expect, it } from 'bun:test';
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { db } from '$lib/server/db/client';
import { appSettings, shareSettings } from '$lib/server/db/schema';
import {
	authorizeThumbnailPayload,
	createSignedThumbnailUrl,
	verifyThumbnailToken
} from '$lib/server/plex/thumbnail-auth';
import { setGlobalShareDefaults } from '$lib/server/sharing/service';
import { ShareMode, ShareModeSource } from '$lib/server/sharing/types';

const USER_ID = 42;
const YEAR = 2026;
const TOKEN_A = '550e8400-e29b-41d4-a716-446655440000';
const TOKEN_B = '660e8400-e29b-41d4-a716-446655440111';

async function expectHttpStatus(run: () => Promise<unknown>, status: number): Promise<void> {
	try {
		await run();
		throw new Error('Expected HTTP error');
	} catch (error) {
		expect((error as { status?: number }).status).toBe(status);
	}
}

function extractToken(url: string): string {
	return new URL(`https://obzorarr.example${url}`).searchParams.get('token') ?? '';
}

function createTestToken(payloadJson: string): string {
	const encodedPayload = Buffer.from(payloadJson).toString('base64url');
	const signature = createHmac('sha256', 'test-thumbnail-secret')
		.update(encodedPayload)
		.digest('base64url');
	return `${encodedPayload}.${signature}`;
}

describe('thumbnail auth tokens', () => {
	beforeEach(async () => {
		await db.delete(shareSettings);
		await db.delete(appSettings);
		await setAppSetting(AppSettingsKey.THUMBNAIL_SIGNING_SECRET, 'test-thumbnail-secret');
	});

	it('keeps concurrently minted tokens valid when creating the signing secret', async () => {
		await db.delete(appSettings);

		const signedUrls = await Promise.all(
			Array.from({ length: 20 }, () =>
				createSignedThumbnailUrl('/library/metadata/123/thumb/456', {
					kind: 'server',
					year: YEAR
				})
			)
		);

		const payloads = await Promise.all(
			signedUrls.map((url) => verifyThumbnailToken(extractToken(url as string)))
		);

		expect(payloads.every((payload) => payload?.path === 'library/metadata/123/thumb/456')).toBe(
			true
		);
	});

	it('replaces an empty signing secret before signing thumbnails', async () => {
		await setAppSetting(AppSettingsKey.THUMBNAIL_SIGNING_SECRET, '');

		const signedUrl = await createSignedThumbnailUrl('/library/metadata/123/thumb/456', {
			kind: 'server',
			year: YEAR
		});

		const secret = await db
			.select({ value: appSettings.value })
			.from(appSettings)
			.where(eq(appSettings.key, AppSettingsKey.THUMBNAIL_SIGNING_SECRET))
			.limit(1);

		expect(secret[0]?.value).not.toBe('');
		const payload = await verifyThumbnailToken(extractToken(signedUrl as string));
		expect(payload?.path).toBe('library/metadata/123/thumb/456');
	});

	it('rejects thumbnail tokens with extra segments', async () => {
		const signedUrl = await createSignedThumbnailUrl('/library/metadata/123/thumb/456', {
			kind: 'server',
			year: YEAR
		});
		const token = extractToken(signedUrl as string);

		await expect(verifyThumbnailToken(`${token}.extra`)).resolves.toBeNull();
	});

	it('rejects thumbnail tokens with non-finite numeric payload fields', async () => {
		const futureExp = Math.floor(Date.now() / 1000) + 60;
		const payloads = [
			`{"v":1,"path":"library/metadata/123/thumb/456","exp":1e999,"kind":"server","year":${YEAR}}`,
			`{"v":1,"path":"library/metadata/123/thumb/456","exp":${futureExp},"kind":"server","year":1e999}`,
			`{"v":1,"path":"library/metadata/123/thumb/456","exp":${futureExp},"kind":"user","year":${YEAR},"userId":1e999}`
		];

		for (const payload of payloads) {
			await expect(verifyThumbnailToken(createTestToken(payload))).resolves.toBeNull();
		}
	});

	it('signs Plex-relative thumbnail paths and authorizes them while wrapped access is public', async () => {
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });

		const signedUrl = await createSignedThumbnailUrl('/library/metadata/123/thumb/456', {
			kind: 'user',
			userId: USER_ID,
			year: YEAR
		});

		expect(signedUrl?.startsWith('/plex/thumb/library/metadata/123/thumb/456?token=')).toBe(true);
		const payload = await verifyThumbnailToken(extractToken(signedUrl as string));
		expect(payload?.path).toBe('library/metadata/123/thumb/456');

		await expect(authorizeThumbnailPayload(payload!, {})).resolves.toBeUndefined();
	});

	it('rejects a previously public thumbnail token after access becomes private-oauth', async () => {
		await setGlobalShareDefaults({ defaultShareMode: ShareMode.PUBLIC, allowUserControl: false });
		const signedUrl = await createSignedThumbnailUrl('/library/metadata/123/thumb/456', {
			kind: 'user',
			userId: USER_ID,
			year: YEAR
		});
		const payload = await verifyThumbnailToken(extractToken(signedUrl as string));

		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_OAUTH,
			allowUserControl: false
		});

		await expectHttpStatus(() => authorizeThumbnailPayload(payload!, {}), 403);
	});

	it('rejects private-link thumbnail tokens after the share token is regenerated', async () => {
		await setGlobalShareDefaults({
			defaultShareMode: ShareMode.PRIVATE_LINK,
			allowUserControl: false
		});
		await db.insert(shareSettings).values({
			userId: USER_ID,
			year: YEAR,
			mode: ShareMode.PRIVATE_LINK,
			modeSource: ShareModeSource.EXPLICIT,
			shareToken: TOKEN_A,
			canUserControl: false
		});

		const signedUrl = await createSignedThumbnailUrl('/library/metadata/123/thumb/456', {
			kind: 'user',
			userId: USER_ID,
			year: YEAR,
			shareToken: TOKEN_A
		});
		const payload = await verifyThumbnailToken(extractToken(signedUrl as string));

		await db
			.update(shareSettings)
			.set({ shareToken: TOKEN_B })
			.where(and(eq(shareSettings.userId, USER_ID), eq(shareSettings.year, YEAR)));

		await expectHttpStatus(() => authorizeThumbnailPayload(payload!, {}), 403);
	});
});
