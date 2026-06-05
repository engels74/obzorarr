import { describe, expect, it } from 'bun:test';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const PROJECT_ROOT = join(import.meta.dir, '..', '..');
const TEST_ROOT = join(PROJECT_ROOT, 'tests');

async function collectFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map(async (entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				return collectFiles(path);
			}
			return [path];
		})
	);

	return nested.flat();
}

describe('test suite architecture contract', () => {
	it('keeps retained Bun.file source guards registered', async () => {
		const registry = await readFile(join(TEST_ROOT, 'SOURCE_GUARDS.md'), 'utf8');
		const testFiles = (await collectFiles(TEST_ROOT)).filter((file) => file.endsWith('.ts'));
		const sourceGuardFiles: string[] = [];
		const sourceGuardCall = ['Bun', 'file('].join('.');

		for (const file of testFiles) {
			const source = await readFile(file, 'utf8');
			if (source.includes(sourceGuardCall)) {
				sourceGuardFiles.push(relative(PROJECT_ROOT, file));
			}
		}

		expect(sourceGuardFiles).not.toHaveLength(0);
		for (const guardFile of sourceGuardFiles) {
			expect(registry).toContain(`\`${guardFile}\``);
		}
	});

	it('keeps tests under unit, property, and helpers instead of nested server paths', async () => {
		let serverPathExists = true;
		try {
			await stat(join(TEST_ROOT, 'unit', 'server'));
		} catch {
			serverPathExists = false;
		}

		expect(serverPathExists).toBe(false);
	});

	it('does not import Jest or Vitest test APIs', async () => {
		const testFiles = (await collectFiles(TEST_ROOT)).filter((file) => file.endsWith('.ts'));

		for (const file of testFiles) {
			const source = await readFile(file, 'utf8');
			expect(source).not.toMatch(/from ['"]vitest['"]/);
			expect(source).not.toMatch(/from ['"]@jest\/globals['"]/);
		}
	});
});
