import type { ApiConfigWithSources, ConfigSource } from '$lib/server/admin/settings.service';
import type { PlexUser } from '$lib/server/auth/types';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';

export interface RestorableSpy {
	mockRestore(): void;
}

export interface TestUserInput {
	id?: number;
	plexId?: number;
	accountId?: number | null;
	username?: string;
	email?: string | null;
	thumb?: string | null;
	isAdmin?: boolean;
}

export async function seedAuthUser(overrides: TestUserInput = {}) {
	const user = {
		id: overrides.id ?? 1,
		plexId: overrides.plexId ?? 1001,
		accountId: overrides.accountId ?? 2001,
		username: overrides.username ?? 'test-user',
		email: overrides.email ?? 'test-user@example.com',
		thumb: overrides.thumb ?? null,
		isAdmin: overrides.isAdmin ?? false
	};

	await db.insert(users).values(user);

	return user;
}

export function restoreSpies(spies: RestorableSpy[]): void {
	for (const spy of spies) spy.mockRestore();
}

export function createTestApiConfig(
	overrides: {
		serverUrl?: string;
		token?: string;
		serverUrlSource?: ConfigSource;
		tokenSource?: ConfigSource;
		isLocked?: boolean;
	} = {}
): ApiConfigWithSources {
	const locked = overrides.isLocked ?? false;
	return {
		plex: {
			serverUrl: {
				value: overrides.serverUrl ?? 'http://test-plex-server:32400',
				source: overrides.serverUrlSource ?? 'env',
				isLocked: locked
			},
			token: {
				value: overrides.token ?? 'test-token',
				source: overrides.tokenSource ?? 'env',
				isLocked: locked
			}
		},
		openai: {
			apiKey: { value: '', source: 'default', isLocked: false },
			baseUrl: { value: 'https://api.openai.com/v1', source: 'default', isLocked: false },
			model: { value: 'gpt-5-mini', source: 'default', isLocked: false }
		}
	};
}

export function createTestPlexUser(overrides: Partial<PlexUser> = {}): PlexUser {
	return {
		id: 12345,
		uuid: 'plex-user-uuid',
		username: 'alice',
		email: 'alice@example.com',
		thumb: 'https://plex.example/avatar.png',
		authToken: 'plex-user-token-from-profile',
		services: [{ identifier: 'metadata-provider', secret: 'service-secret' }],
		...overrides
	};
}
