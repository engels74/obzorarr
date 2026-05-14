import { describe, expect, it } from 'bun:test';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { cachedStats, shareSettings } from '$lib/server/db/schema';

describe('database schema foreign keys', () => {
	it('does not constrain cached stats user_id to local users', () => {
		const config = getTableConfig(cachedStats);

		expect(config.foreignKeys).toHaveLength(0);
	});

	it('keeps share settings user_id constrained to local users', () => {
		const config = getTableConfig(shareSettings);
		const foreignKey = config.foreignKeys[0];
		const reference = foreignKey?.reference();

		expect(config.foreignKeys).toHaveLength(1);
		expect(foreignKey?.getName()).toBe('share_settings_user_id_users_id_fk');
		expect(reference?.columns.map((column) => column.name)).toEqual(['user_id']);
		expect(reference?.foreignColumns.map((column) => column.name)).toEqual(['id']);
		expect(foreignKey?.onDelete).toBe('cascade');
	});
});
