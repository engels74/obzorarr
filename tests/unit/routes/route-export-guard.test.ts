import { describe, expect, it } from 'bun:test';
import { join, relative } from 'node:path';
import { Glob } from 'bun';

// ISSUE-002 route-export guard (PR-1, ships with the ISSUE-001 fix).
//
// Why this exists: CI runs `bun run check` (svelte-kit sync + svelte-check) and
// it was GREEN through ISSUE-001, even though ISSUE-001 was a forbidden
// non-reserved export from a `+page.server.ts`. That proves `bun run check` does
// NOT catch the runtime SvelteKit route-module-export constraint — it is a
// load-time error, not a type error. This static scan catches the exact
// ISSUE-001 shape (and the related `export const`, `export default`,
// `export { x as y }` shapes) cheaply, with no CI-config change.
//
// COVERAGE LIMITS (stated honestly): this is a source-text scan. It folds
// multi-line `export { ... }` lists and flags `export * from "..."` wildcards
// conservatively, but it still CANNOT resolve re-export aliases at runtime or
// follow computed/dynamic re-exports, and it does not actually load the
// modules. The faithful long-term guard is
// `bun run build` (option (c) in the plan): svelte-adapter-bun loads every route
// module and fails on a bad export. Adding `bun run build` to CI is the
// authoritative fix when the maintainer wants it; this test buys immediate,
// zero-setup protection in the meantime.

const PROJECT_ROOT = join(import.meta.dir, '..', '..', '..');
const ROUTES_DIR = join(PROJECT_ROOT, 'src', 'routes');

// SvelteKit-reserved module-level exports a +page.server.ts is allowed to expose
// at runtime. Anything else (other than a `_`-prefixed private helper or a
// type-only export, which is erased) is a runtime load error.
const ALLOWED_EXPORTS = new Set([
	'load',
	'actions',
	'prerender',
	'ssr',
	'csr',
	'trailingSlash',
	'config',
	'entries'
]);

function isAllowedName(name: string): boolean {
	return ALLOWED_EXPORTS.has(name) || name.startsWith('_');
}

/**
 * Joins multi-line `export { ... }` lists onto a single logical line so the
 * line-by-line scan below sees the whole specifier list. A list that opens with
 * `export {` (or `export type {`) but does not close its brace on the same line
 * has subsequent lines folded in (with newlines turned into spaces) until the
 * closing `}` is found. All other lines pass through unchanged.
 */
function joinMultilineExportLists(source: string): string[] {
	const lines = source.split('\n');
	const joined: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i]?.trimStart() ?? '';
		const opensList = /^export\s+(?:type\s+)?\{/.test(trimmed);
		if (opensList && !trimmed.includes('}')) {
			// Fold continuation lines until the closing brace appears.
			let buffer = lines[i] ?? '';
			while (i + 1 < lines.length && !buffer.includes('}')) {
				i++;
				buffer += ` ${(lines[i] ?? '').trim()}`;
			}
			joined.push(buffer);
		} else {
			joined.push(lines[i] ?? '');
		}
	}

	return joined;
}

/**
 * Returns the list of disallowed runtime export names found in a +page.server.ts
 * source string. Type-only exports (`export type` / `export interface`) are
 * skipped because they are erased at runtime. Within an `export { ... }` list,
 * the EXPORTED name is what matters (`export { internal as load }` exports
 * `load`), and `type`-qualified specifiers are skipped. Multi-line `export
 * { ... }` lists are folded onto one logical line first, and `export * from`
 * wildcard re-exports are flagged because their re-exported names cannot be
 * statically resolved and may include non-reserved runtime exports.
 */
export function findDisallowedExports(source: string): string[] {
	const disallowed: string[] = [];

	for (const rawLine of joinMultilineExportLists(source)) {
		const line = rawLine.trimStart();
		if (!line.startsWith('export')) continue;

		// Type-only exports are erased at runtime — never a load-time violation.
		if (/^export\s+(type|interface)\b/.test(line)) continue;

		// `export default ...` is forbidden in a +page.server.ts.
		if (/^export\s+default\b/.test(line)) {
			disallowed.push('default');
			continue;
		}

		// `export * from "..."` (and `export * as ns from "..."`) re-exports
		// names that cannot be resolved statically. A bare `export *` may surface
		// non-reserved runtime exports from the target module, so flag it. A
		// `type`-qualified wildcard (`export type * from`) is erased at runtime.
		if (/^export\s+\*/.test(line) && !/^export\s+type\s+\*/.test(line)) {
			const nsMatch = line.match(/^export\s+\*\s+as\s+([A-Za-z_$][\w$]*)/);
			const wildcardName = nsMatch?.[1] ?? '*';
			if (!isAllowedName(wildcardName)) {
				disallowed.push(wildcardName);
			}
			continue;
		}

		// Re-export list: `export { a, b as c, type D }`.
		const reexport = line.match(/^export\s*\{([^}]*)\}/);
		if (reexport) {
			const specifiers = (reexport[1] ?? '').split(',');
			for (const spec of specifiers) {
				const trimmed = spec.trim();
				if (!trimmed) continue;
				// `export { type Foo }` — type-only specifier, erased at runtime.
				if (/^type\s+/.test(trimmed)) continue;
				// Honor `as` aliasing: the exported name is what callers see.
				const asMatch = trimmed.match(/\bas\s+([A-Za-z_$][\w$]*)/);
				const exportedName = asMatch?.[1] ?? trimmed;
				if (!isAllowedName(exportedName)) {
					disallowed.push(exportedName);
				}
			}
			continue;
		}

		// `export (async )?function NAME` / `export (const|let|var|class) NAME`.
		const decl = line.match(
			/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/
		);
		const declName = decl?.[1];
		if (declName && !isAllowedName(declName)) {
			disallowed.push(declName);
		}
	}

	return disallowed;
}

async function listRouteServerModules(): Promise<string[]> {
	const glob = new Glob('**/+page.server.ts');
	const files: string[] = [];
	for await (const file of glob.scan({ cwd: ROUTES_DIR, absolute: true })) {
		files.push(file);
	}
	return files.sort();
}

describe('ISSUE-002 route-export guard — matcher logic', () => {
	it('flags a forbidden `export const` (the ISSUE-001-class shape)', () => {
		expect(findDisallowedExports('export const foo = 1;')).toEqual(['foo']);
	});

	it('flags a forbidden `export async function`', () => {
		expect(findDisallowedExports('export async function helper() {}')).toEqual(['helper']);
	});

	it('flags an `export default`', () => {
		expect(findDisallowedExports('export default {};')).toEqual(['default']);
	});

	it('flags a re-export alias by its EXPORTED name (`export { x as bar }`)', () => {
		expect(findDisallowedExports('export { x as bar };')).toEqual(['bar']);
	});

	it('does NOT flag a `_`-prefixed private helper export', () => {
		expect(findDisallowedExports('export function _deriveAiKeyMissingNotice() {}')).toEqual([]);
		expect(findDisallowedExports('export const _internal = 1;')).toEqual([]);
	});

	it('does NOT flag type-only exports (erased at runtime)', () => {
		expect(findDisallowedExports('export type Foo = string;')).toEqual([]);
		expect(findDisallowedExports('export interface Bar { x: number }')).toEqual([]);
		expect(findDisallowedExports('export { type Baz } from "./types";')).toEqual([]);
	});

	it('flags disallowed names in a multi-line `export { ... }` list', () => {
		const source = ['export {', '\tfoo,', '\tbar as baz', '};'].join('\n');
		expect(findDisallowedExports(source)).toEqual(['foo', 'baz']);
	});

	it('honors reserved/`_`/type specifiers inside a multi-line list', () => {
		const source = [
			'export {',
			'\thandler as load,',
			'\t_private,',
			'\ttype OnlyAType,',
			'\tnope',
			'} from "./mod";'
		].join('\n');
		expect(findDisallowedExports(source)).toEqual(['nope']);
	});

	it('flags `export * from "..."` wildcard re-exports', () => {
		expect(findDisallowedExports('export * from "./barrel";')).toEqual(['*']);
	});

	it('flags `export * as ns from "..."` by its namespace name', () => {
		expect(findDisallowedExports('export * as helpers from "./barrel";')).toEqual(['helpers']);
	});

	it('does NOT flag `export type * from "..."` (erased at runtime)', () => {
		expect(findDisallowedExports('export type * from "./types";')).toEqual([]);
	});

	it('does NOT flag the SvelteKit-reserved exports', () => {
		const reserved = [
			'export const load = async () => {};',
			'export const actions = {};',
			'export const prerender = true;',
			'export const ssr = false;',
			'export const csr = true;',
			'export const trailingSlash = "always";',
			'export const config = {};',
			'export const entries = () => [];',
			'export { handler as load };'
		].join('\n');
		expect(findDisallowedExports(reserved)).toEqual([]);
	});
});

describe('ISSUE-002 route-export guard — current tree is clean', () => {
	it('finds at least one +page.server.ts to scan', async () => {
		const files = await listRouteServerModules();
		expect(files.length).toBeGreaterThan(0);
	});

	it('every +page.server.ts exports only reserved or `_`-prefixed names', async () => {
		const files = await listRouteServerModules();
		const violations: Record<string, string[]> = {};

		for (const file of files) {
			const source = await Bun.file(file).text();
			const disallowed = findDisallowedExports(source);
			if (disallowed.length > 0) {
				violations[relative(PROJECT_ROOT, file)] = disallowed;
			}
		}

		// If this fails, a route module exports a non-reserved symbol that
		// SvelteKit will reject at load time (the ISSUE-001 class of bug).
		expect(violations).toEqual({});
	});
});
