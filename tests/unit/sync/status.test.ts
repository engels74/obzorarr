import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { AppSettingsKey, setAppSetting } from '$lib/server/admin/settings.service';
import { createSyncStatusStore } from '$lib/stores/sync-status.svelte';
import type { SyncStatusStreamEvent } from '$lib/sync/types';
import { GET } from '../../../src/routes/api/sync/status/stream/+server';
import { resetSharedTestDb } from '../../helpers/db';

type HandlerArgs = Parameters<typeof GET>[0];

const anonLocals = {} as HandlerArgs['locals'];
const authedLocals = {
	user: { id: 1, plexId: 100, username: 'admin', isAdmin: true }
} as HandlerArgs['locals'];

function runGet(locals: HandlerArgs['locals'] = anonLocals): ReturnType<typeof GET> {
	const request = new Request('http://localhost/api/sync/status/stream');
	return GET({
		request,
		locals,
		url: new URL('http://localhost/api/sync/status/stream'),
		getClientAddress: () => '127.0.0.1'
	} as unknown as HandlerArgs);
}

async function expectSse(response: Response): Promise<void> {
	expect(response.status).toBe(200);
	expect(response.headers.get('Content-Type')).toBe('text/event-stream');
	await response.body?.cancel();
}

async function readUntilClosed(reader: ReadableStreamDefaultReader): Promise<boolean> {
	while (true) {
		const { done } = await reader.read();
		if (done) return true;
	}
}

describe('GET /api/sync/status/stream auth gate (ISSUE-017)', () => {
	beforeEach(resetSharedTestDb);

	it('denies anonymous GET with 401 once onboarding is complete', async () => {
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		const response = await runGet(anonLocals);

		expect(response.status).toBe(401);
		expect(response.headers.get('Cache-Control')).toBe('no-store');
		expect(await response.json()).toMatchObject({ message: 'Unauthorized' });
	});

	it.each([
		['anonymous while onboarding is incomplete', anonLocals, false],
		['authenticated once onboarding is complete', authedLocals, true]
	] as const)('allows %s', async (_label, locals, completeOnboarding) => {
		if (completeOnboarding) await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');
		await expectSse(await runGet(locals));
	});

	it('closes an anonymous stream once onboarding completes mid-stream', async () => {
		const response = await runGet(anonLocals);
		expect(response.status).toBe(200);

		const reader = response.body?.getReader();
		expect(reader).toBeDefined();
		if (!reader) return;

		const first = await reader.read();
		if (first.done) throw new Error('Expected initial SSE frame');
		const firstValue = first.value as unknown;
		const text =
			typeof firstValue === 'string'
				? firstValue
				: new TextDecoder().decode(firstValue as Uint8Array);
		expect(text).toContain('"type":"connected"');

		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		expect(
			await Promise.race([
				readUntilClosed(reader),
				new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000))
			])
		).toBe(true);
	});

	it('keeps an authenticated stream open after onboarding completes', async () => {
		const response = await runGet(authedLocals);
		expect(response.status).toBe(200);

		const reader = response.body?.getReader();
		expect(reader).toBeDefined();
		if (!reader) return;

		expect((await reader.read()).done).toBe(false);
		await setAppSetting(AppSettingsKey.ONBOARDING_COMPLETED, 'true');

		expect(
			await Promise.race([
				(async () => !(await reader.read()).done)(),
				new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 3000))
			])
		).toBe(true);

		await reader.cancel();
	});
});

class TestEventSource {
	static instances: TestEventSource[] = [];

	onopen: (() => void) | null = null;
	onmessage: ((event: MessageEvent<string>) => void) | null = null;
	onerror: (() => void) | null = null;
	closed = false;

	constructor(readonly url: string) {
		TestEventSource.instances.push(this);
	}

	close(): void {
		this.closed = true;
	}

	emit(data: SyncStatusStreamEvent): void {
		this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
	}
}

const originalEventSource = globalThis.EventSource;
const originalStateRune = (globalThis as unknown as { $state?: <T>(value: T) => T }).$state;

function installStoreGlobals(): void {
	(globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
		TestEventSource as unknown as typeof EventSource;
	(globalThis as unknown as { $state: <T>(value: T) => T }).$state = (value) => value;
}

function restoreStoreGlobals(): void {
	(globalThis as unknown as { EventSource: typeof EventSource }).EventSource = originalEventSource;
	if (originalStateRune) {
		(globalThis as unknown as { $state?: <T>(value: T) => T }).$state = originalStateRune;
	} else {
		delete (globalThis as unknown as { $state?: <T>(value: T) => T }).$state;
	}
}

function waitForTerminalCallback(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 550));
}

function connectStore(store: ReturnType<typeof createSyncStatusStore>): void {
	(store as unknown as { connect: () => void }).connect();
}

describe('sync status store terminal events', () => {
	beforeEach(() => {
		TestEventSource.instances = [];
		installStoreGlobals();
	});

	afterEach(restoreStoreGlobals);

	it.each([
		['failed', ['failed']],
		['completed', []]
	] as const)('%s terminal event callback handling', async (eventType, expectedCompletedEvents) => {
		const handledEvents: string[] = [];
		const completedEvents: string[] = [];
		const store = createSyncStatusStore(
			{ inProgress: false, progress: null },
			{
				shouldHandleTerminalEvent: (event) => {
					handledEvents.push(event);
					return event === 'failed';
				},
				onSyncComplete: (event) => {
					completedEvents.push(event);
				}
			}
		);
		connectStore(store);

		TestEventSource.instances[0]?.emit({
			type: eventType,
			inProgress: false,
			progress: null
		});
		await waitForTerminalCallback();
		store.disconnect();

		expect(handledEvents).toEqual([eventType]);
		expect(completedEvents).toEqual([...expectedCompletedEvents]);
		expect(store.inProgress).toBe(false);
		expect(store.progress).toBeNull();
	});
});
