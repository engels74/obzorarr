import { Database } from 'bun:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { stopSubprocess } from './subprocess';

const databasePathInput = process.env.DATABASE_PATH;
const timeoutMs = Number(process.env.QA_TIMEOUT_MS ?? '30000');
const shutdownTimeoutMs = 2_000;
const YEAR = new Date().getFullYear();
const SLUGS = {
	owner: 'A'.repeat(22),
	external: 'B'.repeat(22),
	home: 'C'.repeat(22),
	privateOauth: 'D'.repeat(22),
	privateToken: 'E'.repeat(22),
	noHistory: 'F'.repeat(22),
	removed: 'G'.repeat(22)
} as const;
const PRIVATE_TOKEN = '11111111-1111-4111-8111-111111111111';

function fail(message: string): never {
	throw new Error(`Wrapped lookup QA: ${message}`);
}

function isDisposablePath(path: string): boolean {
	const tempRoot = realpathSync(tmpdir());
	const resolved = resolve(path);
	const underTemp = resolved === tempRoot || resolved.startsWith(`${tempRoot}${sep}`);
	const components = resolved.split(sep).filter(Boolean);
	return (
		underTemp ||
		components.some((component) => /^(?:test|tests|tmp|temp)(?:[._-]|$)/i.test(component))
	);
}

function removeDatabaseFiles(path: string): void {
	for (const suffix of ['', '-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
}

if (!databasePathInput) fail('DATABASE_PATH must explicitly name a new disposable database file.');
if (!isAbsolute(databasePathInput)) fail('DATABASE_PATH must be an absolute disposable path.');
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) fail('QA_TIMEOUT_MS must be a positive number.');
const databasePath = resolve(databasePathInput);
if (!isDisposablePath(databasePath))
	fail('DATABASE_PATH must be under the system temp directory or a test/tmp directory.');
if (/(?:^|[._/-])prod(?:uction)?(?:[._/-]|$)/i.test(databasePath))
	fail('DATABASE_PATH must not look like a production database path.');
if (
	existsSync(databasePath) ||
	existsSync(`${databasePath}-wal`) ||
	existsSync(`${databasePath}-shm`)
) {
	fail('DATABASE_PATH and its WAL/SHM sidecars must not already exist.');
}
if (!existsSync('./build'))
	fail('Missing ./build. Run the normal build gate before this QA script.');

mkdirSync(dirname(databasePath), { recursive: true });
let server: ReturnType<typeof Bun.spawn> | undefined;
let portReservation: ReturnType<typeof Bun.serve> | undefined;
let stdout = '';
let stderr = '';

function fingerprint(): string {
	return createHash('sha256')
		.update('obzorarr:plex-config-fingerprint-v1\0')
		.update('\0')
		.digest('hex');
}

function proof(
	confirmedAt: number,
	machineIdentifier = 'qa-machine',
	authorityEpoch = '1'
): string {
	return JSON.stringify({
		protocol: 'three-proof-v1',
		fingerprintProtocol: 'plex-config-fingerprint-v1',
		authorityEpoch,
		machineIdentifier,
		configFingerprint: fingerprint(),
		confirmedAt
	});
}

function database(): Database {
	return new Database(databasePath, { strict: true, create: false });
}

function query<T>(sql: string, ...values: unknown[]): T[] {
	const db = database();
	try {
		return db.prepare(sql).all(...values) as T[];
	} finally {
		db.close();
	}
}

function mutate(sql: string, ...values: unknown[]): void {
	const db = database();
	try {
		db.prepare(sql).run(...values);
	} finally {
		db.close();
	}
}
function setCurrentProof(
	confirmedAt: number,
	machineIdentifier = 'qa-machine',
	authorityEpoch = '1'
): void {
	mutate(
		'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
		'plex_identity_proof',
		proof(confirmedAt, machineIdentifier, authorityEpoch),
		confirmedAt
	);
	mutate('UPDATE plex_accounts SET updated_at = ?', Math.floor(confirmedAt / 1000));
}

function seedDatabase(): void {
	const db = database();
	const now = Date.now();
	const nowSeconds = Math.floor(now / 1000);
	const viewedAt = Math.floor(Date.UTC(YEAR, 0, 2) / 1000);
	const users = [
		[9001, 1, 'Owner QA', 1, SLUGS.owner, 'public', true],
		[42, 42, 'External QA', 0, SLUGS.external, 'public', true],
		[43, 43, 'Home Entitled QA', 0, SLUGS.home, 'public', true],
		[44, 44, 'Home No Entitlement QA', 0, SLUGS.privateOauth, 'private-oauth', true],
		[45, 45, 'Private Token QA', 0, SLUGS.privateToken, 'private-link', true],
		[46, 46, 'No History QA', 0, SLUGS.noHistory, 'public', false],
		[47, 47, 'Removed QA', 0, SLUGS.removed, 'public', true]
	] as const;
	try {
		db.exec('PRAGMA foreign_keys = ON');
		const setting = db.prepare(
			'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)'
		);
		for (const [key, value] of [
			['public_landing_lookup', 'true'],
			['onboarding_completed', 'true'],
			['default_share_mode', 'public'],
			['allow_user_control', 'true'],
			['plex_authority_epoch', '1'],
			['plex_authority_discriminator', fingerprint()],
			['server_machine_id', 'qa-machine'],
			['plex_identity_proof', proof(now)]
		]) {
			setting.run(key, value, now);
		}
		const insertUser = db.prepare(
			'INSERT INTO users (plex_id, account_id, username, is_admin, created_at) VALUES (?, ?, ?, ?, ?)'
		);
		const insertAccount = db.prepare(
			'INSERT INTO plex_accounts (account_id, plex_id, username, is_owner, updated_at) VALUES (?, ?, ?, ?, ?)'
		);
		const insertShare = db.prepare(
			'INSERT INTO share_settings (user_id, year, mode, mode_source, share_token, public_slug, can_user_control) VALUES (?, ?, ?, ?, ?, ?, ?)'
		);
		const insertHistory = db.prepare(
			'INSERT INTO play_history (history_key, rating_key, title, type, viewed_at, account_id, library_section_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
		);
		for (const [plexId, accountId, username, isAdmin, slug, mode, hasHistory] of users) {
			insertUser.run(plexId, accountId, username, isAdmin, nowSeconds);
			if (accountId !== 44)
				insertAccount.run(accountId, plexId, username, accountId === 1 ? 1 : 0, nowSeconds);
			const user = db.prepare('SELECT id FROM users WHERE plex_id = ?').get(plexId) as {
				id: number;
			};
			insertShare.run(
				user.id,
				YEAR,
				mode,
				'explicit',
				mode === 'private-link' ? PRIVATE_TOKEN : null,
				slug,
				0
			);
			if (hasHistory)
				insertHistory.run(
					`qa-${accountId}`,
					`qa-${accountId}`,
					`QA account ${accountId} history`,
					'movie',
					viewedAt,
					accountId,
					1
				);
		}
	} finally {
		db.close();
	}
}

async function run(
	command: string[],
	env: Record<string, string | undefined> = process.env
): Promise<void> {
	const process = Bun.spawn(command, { env, stdout: 'pipe', stderr: 'pipe' });
	const [code, out, err] = await Promise.all([
		process.exited,
		new Response(process.stdout).text(),
		new Response(process.stderr).text()
	]);
	if (code !== 0) fail(`${command.join(' ')} failed (${code}): ${err || out}`);
}

async function request(url: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(5_000), redirect: 'manual' });
	} catch (cause) {
		fail(`request to ${url} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
	}
}

try {
	await run(['bun', 'scripts/migrate.ts'], { ...process.env, DATABASE_PATH: databasePath });
	seedDatabase();
	portReservation = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch: () => new Response(null, { status: 503 })
	});
	const port = portReservation.port;
	await portReservation.stop(true);
	portReservation = undefined;
	const baseUrl = `http://127.0.0.1:${port}`;
	const childEnv = {
		...process.env,
		DATABASE_PATH: databasePath,
		HOST: '127.0.0.1',
		PORT: String(port),
		ORIGIN: baseUrl,
		NODE_ENV: 'production'
	};
	delete childEnv.SOCKET_PATH;
	childEnv.PLEX_SERVER_URL = '';
	childEnv.PLEX_TOKEN = '';
	server = Bun.spawn(['bun', './build'], { env: childEnv, stdout: 'pipe', stderr: 'pipe' });
	void new Response(server.stdout).text().then((value) => {
		stdout = value;
	});
	void new Response(server.stderr).text().then((value) => {
		stderr = value;
	});
	const deadline = Date.now() + timeoutMs;
	let ready = false;
	let readinessStatus: number | null = null;
	while (Date.now() < deadline) {
		if (server.exitCode !== null) break;
		try {
			const readiness = await request(`${baseUrl}/`);
			readinessStatus = readiness.status;
			ready = true;
			break;
		} catch {
			// Startup polling is deliberately bounded by QA_TIMEOUT_MS.
		}
		await Bun.sleep(200);
	}
	if (server.exitCode !== null || !ready)
		fail(
			`server did not become ready within ${timeoutMs}ms (last status: ${readinessStatus ?? 'none'}). ${stderr || stdout}`
		);

	const wrapped = (identifier: string, year = YEAR) => `${baseUrl}/wrapped/${year}/u/${identifier}`;
	const action = async (username: string) => {
		const response = await request(`${baseUrl}/?/lookupUser`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded', origin: baseUrl },
			body: new URLSearchParams({ username })
		});
		const text = await response.clone().text();
		let payload: { type?: unknown; status?: unknown; location?: unknown } | null = null;
		try {
			payload = JSON.parse(text);
		} catch {
			// A rate-limit response is not an action payload.
		}
		return {
			response,
			status: typeof payload?.status === 'number' ? payload.status : response.status,
			type: typeof payload?.type === 'string' ? payload.type : null,
			location:
				typeof payload?.location === 'string' ? payload.location : response.headers.get('location'),
			text
		};
	};
	const expectLookup = async (label: string, username: string, slug?: string) => {
		const result = await action(username);
		if (slug) {
			if (
				result.status !== 303 ||
				result.type !== 'redirect' ||
				!result.location?.includes(`/wrapped/${YEAR}/u/${slug}`)
			)
				fail(`${label} expected a 303 opaque redirect, got ${result.status}: ${result.text}`);
		} else if (result.status !== 404 || result.type !== 'failure') {
			fail(`${label} expected the generic lookup 404, got ${result.status}: ${result.text}`);
		}
		return result;
	};
	const expectStatus = async (
		label: string,
		url: string,
		status: number,
		headers?: HeadersInit
	): Promise<Response> => {
		const response = await request(url, { headers });
		if (response.status !== status) fail(`${label} expected ${status}, got ${response.status}.`);
		return response;
	};

	// The ten action requests below intentionally consume the fixed anonymous lookup budget.
	await expectLookup('external identity', 'external qa', SLUGS.external);
	await expectLookup('entitled Home identity', 'HOME ENTITLED qa', SLUGS.home);
	await expectLookup('Home identity without entitlement', 'home no entitlement qa');
	await expectLookup('no-history identity', 'no history qa');
	mutate(
		'UPDATE plex_accounts SET username = ? WHERE account_id IN (?, ?)',
		'Case Fold QA',
		42,
		43
	);
	await expectLookup('ambiguous case-fold identity', 'case fold qa');
	mutate('UPDATE plex_accounts SET username = ? WHERE account_id = ?', 'External QA', 42);
	mutate('DELETE FROM app_settings WHERE key = ?', 'plex_identity_proof');
	await expectLookup('missing identity proof', 'external qa');
	const freshBoundaryAt = Date.now() - 86_399_000;
	setCurrentProof(freshBoundaryAt);
	await expectLookup('86,399-second freshness boundary', 'external qa', SLUGS.external);
	const staleBoundaryAt = Date.now() - 86_400_000;
	setCurrentProof(staleBoundaryAt);
	await expectLookup('86,400-second freshness boundary', 'external qa');
	const currentAuthorityAt = Date.now();
	setCurrentProof(currentAuthorityAt);
	mutate('DELETE FROM plex_accounts WHERE account_id = ?', 47);
	await expectLookup('removed mapping', 'removed qa');
	mutate(
		'INSERT INTO plex_accounts (account_id, plex_id, username, is_owner, updated_at) VALUES (?, ?, ?, ?, ?)',
		47,
		47,
		'Removed QA',
		0,
		Math.floor(currentAuthorityAt / 1000)
	);
	await expectLookup('exact re-entitled mapping', 'removed qa', SLUGS.removed);
	const limited = await action('unknown qa');
	if (limited.status !== 429 || !limited.response.headers.get('retry-after'))
		fail(`eleventh lookup expected 429 with Retry-After, got ${limited.status}.`);

	await expectStatus('public opaque target', wrapped(SLUGS.external), 200);
	await expectStatus('owner opaque target', wrapped(SLUGS.owner), 200);
	await expectStatus('private OAuth opaque target', wrapped(SLUGS.privateOauth), 404);
	await expectStatus('private token target', wrapped(PRIVATE_TOKEN), 200);
	await expectStatus('private token wrong year', wrapped(PRIVATE_TOKEN, YEAR - 1), 404);
	mutate(
		'UPDATE app_settings SET value = ? WHERE key = ?',
		'{"protocol":"legacy"}',
		'plex_identity_proof'
	);
	await expectStatus('legacy identity proof', wrapped(SLUGS.external), 404);
	setCurrentProof(Date.now());
	const anonymousDenials = await Promise.all([
		request(wrapped('not-a-real-opaque-identifier')),
		request(wrapped(SLUGS.privateOauth)),
		request(wrapped('999999'))
	]);
	await expectStatus('target-isolated opaque success', wrapped(SLUGS.external), 200);
	const denialBodies = await Promise.all(anonymousDenials.map((response) => response.text()));
	const genericMessageFragment = 'find a Wrapped page for that link';
	if (
		anonymousDenials.some((response) => response.status !== 404) ||
		denialBodies.some((body) => !body.includes(genericMessageFragment)) ||
		denialBodies.some((body) =>
			['not-a-real-opaque-identifier', SLUGS.privateOauth, '999999'].some((identifier) =>
				body.includes(identifier)
			)
		)
	) {
		fail('anonymous unknown, private OAuth, and numeric denials must expose only the generic 404.');
	}

	const shareRowsBefore = query<{ count: number }>(
		'SELECT COUNT(*) AS count FROM share_settings'
	)[0]?.count;
	await expectStatus('anonymous numeric no-create', wrapped('999998'), 404);
	const shareRowsAfter = query<{ count: number }>('SELECT COUNT(*) AS count FROM share_settings')[0]
		?.count;
	if (shareRowsBefore !== shareRowsAfter) fail('anonymous numeric request created share settings.');

	// Config/machine mismatch must fail closed without deleting retained observations.
	const mappingsBeforeTransition = query<{ count: number }>(
		'SELECT COUNT(*) AS count FROM plex_accounts'
	)[0]?.count;
	mutate(
		'UPDATE app_settings SET value = ? WHERE key = ?',
		'qa-other-machine',
		'server_machine_id'
	);
	await expectStatus('machine transition', wrapped(SLUGS.external), 404);
	mutate('UPDATE app_settings SET value = ? WHERE key = ?', 'qa-machine', 'server_machine_id');
	mutate('UPDATE app_settings SET value = ? WHERE key = ?', '2', 'plex_authority_epoch');
	await expectStatus('config authority transition', wrapped(SLUGS.external), 404);
	mutate('UPDATE app_settings SET value = ? WHERE key = ?', '1', 'plex_authority_epoch');
	if (
		query<{ count: number }>('SELECT COUNT(*) AS count FROM plex_accounts')[0]?.count !==
		mappingsBeforeTransition
	)
		fail('failed observations or transitions must retain the prior complete mapping.');
	await expectStatus(
		'retained complete mapping after failed observation',
		wrapped(SLUGS.external),
		200
	);

	// Delayed acquisition ABA is exercised by the integration harness; HTTP
	// independently proves that a stale authority epoch cannot authorize a route.
	setCurrentProof(Date.now(), 'qa-machine', '999');
	await expectStatus('stale authority proof', wrapped(SLUGS.external), 404);
	setCurrentProof(Date.now());
	await expectStatus('restored current authority', wrapped(SLUGS.external), 200);

	console.log('Wrapped lookup HTTP QA passed.');
} finally {
	if (portReservation) await portReservation.stop(true);
	if (server) await stopSubprocess(server, shutdownTimeoutMs);
	removeDatabaseFiles(databasePath);
}
