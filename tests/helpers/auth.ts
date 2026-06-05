import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';

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
