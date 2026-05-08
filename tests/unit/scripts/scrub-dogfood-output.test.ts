import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

describe('scrub dogfood output script', () => {
	let tempDir: string;
	let envPath: string;
	let outputRoot: string;
	let reportPath: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'obzorarr-dogfood-scrub-'));
		envPath = join(tempDir, '.env');
		outputRoot = join(tempDir, 'dogfood-output');
		reportPath = join(outputRoot, 'report.md');

		await mkdir(outputRoot, { recursive: true });
		await writeFile(
			envPath,
			[
				'PLEX_SERVER_URL=http://plex-secret.local:32400',
				'PLEX_TOKEN=env-plex-token',
				'PLEX_ADMIN_USER_EMAIL=admin@example.com',
				'PLEX_ADMIN_USER_PASSWORD=admin-password',
				'PLEX_TEST_USER_EMAIL=user@example.com',
				'PLEX_TEST_USER_PASSWORD=user-password'
			].join('\n')
		);
		await writeFile(
			reportPath,
			[
				'Bootstrap token: abcd-ef12-3456',
				'Cookie: obzorarr_onboarding_claim=claim-cookie-secret; Path=/',
				'JSON cookie: "obzorarr_onboarding_claim":"json-claim-secret"',
				'Configured token: env-plex-token',
				'Admin password: admin-password'
			].join('\n')
		);
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	async function runScrub(write = false) {
		const result = Bun.spawn(
			['bun', 'run', 'scripts/scrub-dogfood-output.ts', ...(write ? ['--write'] : [])],
			{
				cwd: PROJECT_ROOT,
				env: {
					...process.env,
					DOGFOOD_ENV_PATH: envPath,
					DOGFOOD_OUTPUT_ROOT: outputRoot
				},
				stdout: 'pipe',
				stderr: 'pipe'
			}
		);

		const [exitCode, stdout, stderr] = await Promise.all([
			result.exited,
			new Response(result.stdout).text(),
			new Response(result.stderr).text()
		]);
		return { exitCode, stdout, stderr };
	}

	it('detects bootstrap tokens during dry run', async () => {
		const result = await runScrub();

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain('BOOTSTRAP_TOKEN');
		expect(result.stderr).toContain('Run `bun run dogfood:scrub -- --write`');
	});

	it('reports redacted filenames during dry run', async () => {
		await writeFile(
			join(outputRoot, 'report-env-plex-token.md'),
			'Configured token: env-plex-token'
		);

		const result = await runScrub();

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toContain('Found filename secret(s) PLEX_TOKEN');
		expect(result.stdout).toContain('Found content secret(s) PLEX_TOKEN');
		expect(result.stdout).toContain('report-__PLEX_TOKEN__.md');
		expect(result.stdout).not.toContain('report-env-plex-token.md');
		expect(result.stdout).not.toContain('env-plex-token');
	});

	it('redacts bootstrap tokens and onboarding claim cookie values with --write', async () => {
		const result = await runScrub(true);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Redacted content secret(s)');

		const redacted = await readFile(reportPath, 'utf8');
		expect(redacted).toContain('Bootstrap token: <BOOTSTRAP_TOKEN>');
		expect(redacted).toContain('obzorarr_onboarding_claim=<ONBOARDING_CLAIM_COOKIE>');
		expect(redacted).toContain('"obzorarr_onboarding_claim":"<ONBOARDING_CLAIM_COOKIE>"');
		expect(redacted).not.toContain('claim-cookie-secret');
		expect(redacted).not.toContain('json-claim-secret');
	});

	it('redacts dynamic secrets when no configured .env secret values exist', async () => {
		await writeFile(envPath, 'OTHER=value');
		await writeFile(
			reportPath,
			[
				'Bootstrap token: abcd-ef12-3456',
				'Cookie: obzorarr_onboarding_claim=claim-cookie-secret; Path=/',
				'JSON cookie: "obzorarr_onboarding_claim":"json-claim-secret"'
			].join('\n')
		);

		const result = await runScrub(true);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('Redacted content secret(s)');

		const redacted = await readFile(reportPath, 'utf8');
		expect(redacted).toContain('Bootstrap token: <BOOTSTRAP_TOKEN>');
		expect(redacted).toContain('obzorarr_onboarding_claim=<ONBOARDING_CLAIM_COOKIE>');
		expect(redacted).toContain('"obzorarr_onboarding_claim":"<ONBOARDING_CLAIM_COOKIE>"');
		expect(redacted).not.toContain('claim-cookie-secret');
		expect(redacted).not.toContain('json-claim-secret');
	});

	it('leaves no configured .env secret values in text artifacts after --write', async () => {
		await runScrub(true);

		const redacted = await readFile(reportPath, 'utf8');
		for (const secret of ['env-plex-token', 'admin-password']) {
			expect(redacted).not.toContain(secret);
		}
		expect(redacted).toContain('<PLEX_TOKEN>');
		expect(redacted).toContain('<PLEX_ADMIN_USER_PASSWORD>');
	});
});
