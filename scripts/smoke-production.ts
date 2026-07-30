import { stopSubprocess } from './subprocess';

const databasePath = process.env.DATABASE_PATH;
if (!databasePath) {
	throw new Error('DATABASE_PATH must point to a disposable database');
}

const requestedPort = Number(process.env.PORT ?? '0');
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
	throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

let portReservation: ReturnType<typeof Bun.serve>;
try {
	portReservation = Bun.serve({
		hostname: '127.0.0.1',
		port: requestedPort,
		fetch: () => new Response(null, { status: 503 })
	});
} catch (cause) {
	throw new Error(`Smoke-test port ${requestedPort} is already in use`, { cause });
}
const port = portReservation.port;
await portReservation.stop(true);

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? '30000');
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
	throw new Error(`Invalid SMOKE_TIMEOUT_MS: ${process.env.SMOKE_TIMEOUT_MS}`);
}

const childEnv = {
	...process.env,
	DATABASE_PATH: databasePath,
	HOST: '127.0.0.1',
	NODE_ENV: 'production',
	PORT: String(port)
};
delete childEnv.SOCKET_PATH;

const server = Bun.spawn(['bun', './build'], {
	env: childEnv,
	stdout: 'pipe',
	stderr: 'pipe'
});
const stdout = new Response(server.stdout).text();
const stderr = new Response(server.stderr).text();
const deadline = Date.now() + timeoutMs;
let ready = false;
const shutdownTimeoutMs = 2_000;

try {
	while (Date.now() < deadline) {
		if (server.exitCode !== null) {
			break;
		}

		try {
			const response = await fetch(`http://127.0.0.1:${port}/`, {
				signal: AbortSignal.timeout(2_000)
			});
			if (response.ok) {
				await Bun.sleep(50);
				if (server.exitCode === null) {
					ready = true;
					break;
				}
			}
		} catch {
			// The listener may not be ready yet.
		}

		await Bun.sleep(250);
	}
} finally {
	await stopSubprocess(server, shutdownTimeoutMs);
}

if (!ready) {
	console.error(`Production server did not become ready within ${timeoutMs}ms`);
	const [stdoutText, stderrText] = await Promise.all([stdout, stderr]);
	if (stdoutText) console.error(stdoutText);
	if (stderrText) console.error(stderrText);
	process.exit(1);
}

console.log(`Production server became ready on port ${port}`);
