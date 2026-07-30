import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

describe('production smoke runner', () => {
	it('rejects an occupied port instead of accepting a foreign HTTP server', async () => {
		const tempDir = mkdtempSync(join(tmpdir(), 'obzorarr-smoke-test-'));
		const foreignServer = Bun.serve({
			hostname: '127.0.0.1',
			port: 0,
			fetch: () => new Response('foreign server')
		});

		try {
			const result = Bun.spawn(['bun', 'run', 'scripts/smoke-production.ts'], {
				cwd: PROJECT_ROOT,
				env: {
					...process.env,
					DATABASE_PATH: join(tempDir, 'smoke.db'),
					PORT: String(foreignServer.port),
					SMOKE_TIMEOUT_MS: '1000'
				},
				stdout: 'pipe',
				stderr: 'pipe'
			});
			const [exitCode, stdout, stderr] = await Promise.all([
				result.exited,
				new Response(result.stdout).text(),
				new Response(result.stderr).text()
			]);

			expect(exitCode).not.toBe(0);
			expect(`${stdout}\n${stderr}`).toContain(
				`Smoke-test port ${foreignServer.port} is already in use`
			);
		} finally {
			await foreignServer.stop(true);
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
