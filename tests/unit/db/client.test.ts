/**
 * Unit tests for Database Client Module
 *
 * Tests the module-level initialization code in db/client.ts.
 * This includes environment safety checks and directory creation.
 *
 * These tests use subprocesses because the db/client module executes
 * code at import time, and the main process already has it loaded.
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

describe('db/client module initialization', () => {
	describe('environment safety check', () => {
		it('throws error when test env attempts non-memory DB access', async () => {
			// Create a simple script that tries to import the db client with wrong config
			const script = `
				process.env.NODE_ENV = 'test';
				process.env.DATABASE_PATH = '/tmp/production.db';
				try {
					await import('$lib/server/db/client');
					process.exit(0); // Should not reach here
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

			const result = await Bun.spawn(['bun', '--eval', script], {
				cwd: PROJECT_ROOT,
				env: {
					...process.env,
					NODE_ENV: 'test',
					DATABASE_PATH: '/tmp/production.db'
				},
				stdout: 'pipe',
				stderr: 'pipe'
			});

			const exitCode = await result.exited;
			const stdout = await new Response(result.stdout).text();

			// Exit code 1 means our expected error was thrown
			expect(exitCode).toBe(1);
			expect(stdout).toContain('EXPECTED_ERROR');
		});

		it('allows test env with memory database', async () => {
			const script = `
				process.env.NODE_ENV = 'test';
				process.env.DATABASE_PATH = ':memory:';
				try {
					const { db } = await import('$lib/server/db/client');
					if (db) {
						console.log('SUCCESS');
						process.exit(0);
					}
					process.exit(1);
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					console.error('ERROR:', message);
					process.exit(2);
				}
			`;

			const result = await Bun.spawn(['bun', '--eval', script], {
				cwd: PROJECT_ROOT,
				env: {
					...process.env,
					NODE_ENV: 'test',
					DATABASE_PATH: ':memory:'
				},
				stdout: 'pipe',
				stderr: 'pipe'
			});

			const exitCode = await result.exited;
			const stdout = await new Response(result.stdout).text();

			expect(exitCode).toBe(0);
			expect(stdout).toContain('SUCCESS');
		});

		it('allows test env with test-prefixed database path', async () => {
			const script = `
				process.env.NODE_ENV = 'test';
				process.env.DATABASE_PATH = '/tmp/test-obzorarr.db';
				try {
					const { db } = await import('$lib/server/db/client');
					if (db) {
						console.log('SUCCESS');
						process.exit(0);
					}
					process.exit(1);
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					console.error('ERROR:', message);
					process.exit(2);
				}
			`;

			const result = await Bun.spawn(['bun', '--eval', script], {
				cwd: PROJECT_ROOT,
				env: {
					...process.env,
					NODE_ENV: 'test',
					DATABASE_PATH: '/tmp/test-obzorarr.db'
				},
				stdout: 'pipe',
				stderr: 'pipe'
			});

			const exitCode = await result.exited;
			const stdout = await new Response(result.stdout).text();

			expect(exitCode).toBe(0);
			expect(stdout).toContain('SUCCESS');
		});
	});

	describe('directory creation', () => {
		it('creates parent directory for file-based databases in non-test env', async () => {
			// Use a temp directory that doesn't exist
			const tempDbPath = `/tmp/obzorarr-test-${Date.now()}/data/test.db`;

			const script = `
				import { existsSync, rmSync } from 'node:fs';
				import { dirname } from 'node:path';

				process.env.NODE_ENV = 'development';
				process.env.DATABASE_PATH = '${tempDbPath}';

				try {
					const { db } = await import('$lib/server/db/client');

					// Check if parent directory was created
					const parentDir = dirname('${tempDbPath}');
					if (existsSync(parentDir)) {
						console.log('DIRECTORY_CREATED');
						// Cleanup
						rmSync(dirname(parentDir), { recursive: true, force: true });
						process.exit(0);
					} else {
						console.log('DIRECTORY_NOT_CREATED');
						process.exit(1);
					}
				} catch (e) {
					const message = e instanceof Error ? e.message : String(e);
					console.error('ERROR:', message);
					process.exit(2);
				}
			`;

			const result = await Bun.spawn(['bun', '--eval', script], {
				cwd: PROJECT_ROOT,
				env: {
					...process.env,
					NODE_ENV: 'development',
					DATABASE_PATH: tempDbPath
				},
				stdout: 'pipe',
				stderr: 'pipe'
			});

			const exitCode = await result.exited;
			const stdout = await new Response(result.stdout).text();

			expect(exitCode).toBe(0);
			expect(stdout).toContain('DIRECTORY_CREATED');
		});
	});

	describe('exported objects', () => {
		it('exports db and sqlite objects', async () => {
			// This test uses the already-loaded module from the test setup
			const { db, sqlite } = await import('$lib/server/db/client');

			expect(db).toBeDefined();
			expect(sqlite).toBeDefined();
		});
	});
});
