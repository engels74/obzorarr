import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

async function runVerifier(databasePath: string) {
	const child = Bun.spawn(['bun', 'run', 'scripts/verify-wrapped-lookup.ts'], {
		cwd: PROJECT_ROOT,
		env: { ...process.env, DATABASE_PATH: databasePath },
		stdout: 'pipe',
		stderr: 'pipe',
		signal: AbortSignal.timeout(2_000)
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text()
	]);
	return { exitCode, output: `${stdout}\n${stderr}` };
}

describe('Wrapped lookup QA path safety', () => {
	it('rejects a temp-looking path whose symlink target is not disposable', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'obzorarr-wrapped-symlink-test-'));
		const linkPath = join(tempDir, 'test-data');
		const databaseName = `wrapped-symlink-guard-${randomUUID()}.db`;
		const nonDisposableRoot = parse(realpathSync(tmpdir())).root;
		const databasePath = join(linkPath, databaseName);
		const resolvedDatabasePath = join(nonDisposableRoot, databaseName);
		symlinkSync(nonDisposableRoot, linkPath, 'dir');

		try {
			const result = await runVerifier(databasePath);
			expect(result.exitCode).not.toBe(0);
			expect(result.output).toContain(
				'DATABASE_PATH must be under the system temp directory or a test/tmp directory.'
			);
		} finally {
			for (const suffix of ['', '-wal', '-shm'])
				rmSync(`${resolvedDatabasePath}${suffix}`, { force: true });
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('rejects dangling database and sidecar symlinks as existing entries', async () => {
		for (const suffix of ['', '-wal', '-shm']) {
			const tempDir = mkdtempSync(join(tmpdir(), 'obzorarr-wrapped-dangling-test-'));
			const databasePath = join(tempDir, 'wrapped.db');
			symlinkSync(join(tempDir, 'missing-target'), `${databasePath}${suffix}`);

			try {
				const result = await runVerifier(databasePath);
				expect(result.exitCode).not.toBe(0);
				expect(result.output).toContain(
					'DATABASE_PATH and its WAL/SHM sidecars must not already exist.'
				);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		}
	});

	it('rejects a dangling symlink in an ancestor path', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'obzorarr-wrapped-ancestor-test-'));
		const linkPath = join(tempDir, 'test-data');
		const databasePath = join(linkPath, 'wrapped.db');
		symlinkSync(join(tempDir, 'missing-directory'), linkPath, 'dir');

		try {
			const result = await runVerifier(databasePath);
			expect(result.exitCode).not.toBe(0);
			expect(result.output).toContain(
				'DATABASE_PATH must not contain dangling or cyclic symlinks.'
			);
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
