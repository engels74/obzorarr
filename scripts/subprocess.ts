export interface StoppableSubprocess {
	readonly exitCode: number | null;
	readonly exited: Promise<number>;
	kill(signal?: number | NodeJS.Signals): void;
	unref(): void;
}

async function waitForExit(
	subprocess: StoppableSubprocess,
	shutdownTimeoutMs: number
): Promise<boolean> {
	return await new Promise((resolve) => {
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			resolve(false);
		}, shutdownTimeoutMs);

		void subprocess.exited.then(() => {
			if (timedOut) return;
			clearTimeout(timer);
			resolve(true);
		});
	});
}

export async function stopSubprocess(
	subprocess: StoppableSubprocess,
	shutdownTimeoutMs: number
): Promise<void> {
	if (subprocess.exitCode !== null) return;

	subprocess.kill();
	if (await waitForExit(subprocess, shutdownTimeoutMs)) return;

	subprocess.kill('SIGKILL');
	if (await waitForExit(subprocess, shutdownTimeoutMs)) return;

	subprocess.unref();
	throw new Error(`Subprocess did not terminate within ${shutdownTimeoutMs * 2}ms`);
}
