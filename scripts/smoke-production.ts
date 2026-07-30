const databasePath = process.env.DATABASE_PATH;
if (!databasePath) {
	throw new Error('DATABASE_PATH must point to a disposable database');
}

const port = Number(process.env.PORT ?? '3000');
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
	throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? '30000');
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
	throw new Error(`Invalid SMOKE_TIMEOUT_MS: ${process.env.SMOKE_TIMEOUT_MS}`);
}

const server = Bun.spawn(['bun', './build'], {
	env: {
		...process.env,
		DATABASE_PATH: databasePath,
		NODE_ENV: 'production',
		PORT: String(port)
	},
	stdout: 'pipe',
	stderr: 'pipe'
});
const stdout = new Response(server.stdout).text();
const stderr = new Response(server.stderr).text();
const deadline = Date.now() + timeoutMs;
let ready = false;

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
				ready = true;
				break;
			}
		} catch {
			// The listener may not be ready yet.
		}

		await Bun.sleep(250);
	}
} finally {
	if (server.exitCode === null) {
		server.kill();
	}
	await server.exited;
}

if (!ready) {
	console.error(`Production server did not become ready within ${timeoutMs}ms`);
	const [stdoutText, stderrText] = await Promise.all([stdout, stderr]);
	if (stdoutText) console.error(stdoutText);
	if (stderrText) console.error(stderrText);
	process.exit(1);
}

console.log(`Production server became ready on port ${port}`);
