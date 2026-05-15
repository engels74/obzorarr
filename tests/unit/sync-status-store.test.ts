import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createSyncStatusStore } from '$lib/stores/sync-status.svelte';
import type { SyncStatusStreamEvent } from '$lib/sync/types';

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

function installEventSource(): void {
	(globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
		TestEventSource as unknown as typeof EventSource;
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
		installEventSource();
		(globalThis as unknown as { $state: <T>(value: T) => T }).$state = (value) => value;
	});

	afterEach(() => {
		(globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
			originalEventSource;
		if (originalStateRune) {
			(globalThis as unknown as { $state?: <T>(value: T) => T }).$state = originalStateRune;
		} else {
			delete (globalThis as unknown as { $state?: <T>(value: T) => T }).$state;
		}
	});

	it('handles a failed terminal event when the lookup marker asks for it', async () => {
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

		TestEventSource.instances[0]?.emit({ type: 'failed', inProgress: false, progress: null });
		await waitForTerminalCallback();
		store.disconnect();

		expect(handledEvents).toEqual(['failed']);
		expect(completedEvents).toEqual(['failed']);
		expect(store.inProgress).toBe(false);
		expect(store.progress).toBeNull();
	});

	it('leaves an unobserved successful terminal event silent', async () => {
		const completedEvents: string[] = [];
		const store = createSyncStatusStore(
			{ inProgress: false, progress: null },
			{
				shouldHandleTerminalEvent: (event) => event === 'failed',
				onSyncComplete: (event) => {
					completedEvents.push(event);
				}
			}
		);
		connectStore(store);

		TestEventSource.instances[0]?.emit({ type: 'completed', inProgress: false, progress: null });
		await waitForTerminalCallback();
		store.disconnect();

		expect(completedEvents).toEqual([]);
		expect(store.inProgress).toBe(false);
		expect(store.progress).toBeNull();
	});
});
