/**
 * Unit tests for Database Client Module
 *
 * Tests module-level initialization code in db/client.ts. These use subprocesses
 * because db/client executes on import and the main test process preloads it.
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

async function runDbClientScript(script: string, env: Record<string, string>) {
	const result = await Bun.spawn(['bun', '--eval', script], {
		cwd: PROJECT_ROOT,
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe'
	});

	return {
		exitCode: await result.exited,
		stdout: await new Response(result.stdout).text()
	};
}

describe('db/client module initialization', () => {
	describe('environment safety check', () => {
		it.each([
			['/tmp/production.db', 1, 'EXPECTED_ERROR'],
			[':memory:', 0, 'SUCCESS'],
			['/tmp/test-obzorarr.db', 0, 'SUCCESS']
		] as const)('handles test DATABASE_PATH=%s', async (databasePath, exitCode, output) => {
			const script = `
				process.env.NODE_ENV = 'test';
				process.env.DATABASE_PATH = '${databasePath}';
				try {
					const { db } = await import('$lib/server/db/client');
					if (db) {
						console.log('SUCCESS');
						process.exit(0);
					}
					process.exit(1);
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					if (message.includes('CRITICAL')) {
						console.log('EXPECTED_ERROR');
						process.exit(1);
					}
					console.error('UNEXPECTED_ERROR:', message);
					process.exit(2);
				}
			`;

			const result = await runDbClientScript(script, {
				NODE_ENV: 'test',
				DATABASE_PATH: databasePath
			});

			expect(result.exitCode).toBe(exitCode);
			expect(result.stdout).toContain(output);
		});
	});

	describe('directory creation', () => {
		it('creates parent directory for file-based databases in non-test env', async () => {
			const tempDbPath = `/tmp/obzorarr-test-${Date.now()}/data/test.db`;
			const script = `
				import { existsSync, rmSync } from 'node:fs';
				import { dirname } from 'node:path';

				process.env.NODE_ENV = 'development';
				process.env.DATABASE_PATH = '${tempDbPath}';

				try {
					await import('$lib/server/db/client');
					const parentDir = dirname('${tempDbPath}');
					if (existsSync(parentDir)) {
						console.log('DIRECTORY_CREATED');
						rmSync(dirname(parentDir), { recursive: true, force: true });
						process.exit(0);
					}
					console.log('DIRECTORY_NOT_CREATED');
					process.exit(1);
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					console.error('ERROR:', message);
					process.exit(2);
				}
			`;

			const result = await runDbClientScript(script, {
				NODE_ENV: 'development',
				DATABASE_PATH: tempDbPath
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('DIRECTORY_CREATED');
		});
	});

	describe('exported objects', () => {
		it('exports db and sqlite objects', async () => {
			const { db, sqlite } = await import('$lib/server/db/client');

			expect(db).toBeDefined();
			expect(sqlite).toBeDefined();
		});
	});
});
