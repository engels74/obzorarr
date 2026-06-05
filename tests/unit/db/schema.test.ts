import { describe, expect, it } from 'bun:test';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { sqlite } from '$lib/server/db/client';
import { cachedStats, shareSettings } from '$lib/server/db/schema';
import { sharedTestDbTables } from '../../helpers/db';

interface SqliteTableInfo {
	name: string;
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function getActualColumnNames(tableName: string): string[] {
	return sqlite
		.query<SqliteTableInfo, []>(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
		.all()
		.map((column) => column.name)
		.sort();
}

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

describe('test setup schema contract', () => {
	it('creates the same table columns as the Drizzle app schema', () => {
		for (const table of Object.values(sharedTestDbTables)) {
			const config = getTableConfig(table);
			const expectedColumns = config.columns.map((column) => column.name).sort();

			expect(getActualColumnNames(config.name)).toEqual(expectedColumns);
		}
	});
});
