import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

// DF-07 source-guard: no console.log / console.debug / console.info in
// src/lib/client/**/*.ts. These calls are the most likely vector for leaking
// Plex token material (OAuth response bodies, auth tokens) into the browser
// DevTools console. console.warn for error messages without payloads is
// acceptable.
//
// The guard intentionally covers only src/lib/client/ because that is the
// boundary where token-bearing responses arrive. If a call is reintroduced
// this test will fail, surfacing the exact offending line for the reviewer.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');

async function readSource(relPath: string): Promise<string> {
	return Bun.file(join(PROJECT_ROOT, relPath)).text();
}

const CLIENT_FILES = ['src/lib/client/auth-mode.ts', 'src/lib/client/plex-login.ts'];

// Matches console.log(, console.debug(, console.info( — all variants that can
// dump structured payloads. console.warn( is intentionally excluded.
const FORBIDDEN_LOG_RE = /console\.(log|debug|info)\s*\(/;

describe('DF-07 — no console.log/debug/info in src/lib/client/**', () => {
	for (const relPath of CLIENT_FILES) {
		it(`${relPath} must not call console.log / console.debug / console.info`, async () => {
			const src = await readSource(relPath);
			const lines = src.split('\n');
			const offending = lines
				.map((line, i) => ({ line, lineNo: i + 1 }))
				.filter(({ line }) => FORBIDDEN_LOG_RE.test(line));

			expect(
				offending,
				`Found forbidden console calls in ${relPath}:\n` +
					offending.map(({ lineNo, line }) => `  line ${lineNo}: ${line.trim()}`).join('\n')
			).toHaveLength(0);
		});
	}
});
