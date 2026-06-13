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
// multi-line `export { ... }` lists, flags `export * from "..."` wildcards, and
// extracts every bound name from multi-declarator and destructured
// `export const|let|var` bindings — all conservatively. It still CANNOT resolve
// re-export aliases at runtime or follow computed/dynamic re-exports, and it
// does not actually load the modules. The faithful long-term guard is
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
 * Extracts the bound identifiers introduced by an `export const|let|var`
 * binding-list string (everything after the keyword, e.g. `foo = 1, bar = 2`
 * or `{ a, b: c = d, ...rest } = obj`). This is a conservative regex-level
 * scan, NOT a real parser: it strips out the initializer of each top-level
 * declarator (`= ...`) and then collects identifiers from any destructuring
 * pattern (object/array, including nested, aliased, default, and rest forms)
 * or plain identifier on the left-hand side.
 *
 * Consistent with the `export *` "flag when you can't resolve" stance, this
 * prefers over-collecting an ambiguous binding to silently missing it. A
 * property KEY in object destructuring (`{ key: local }`) is not a binding —
 * only the LOCAL name (`local`) is — and a default/initializer value
 * (`{ a = something }`) is not a binding either; both are excluded by trimming
 * to the binding side of `:` and dropping `= ...` initializers.
 */
function extractBoundNames(declarators: string): string[] {
	const names: string[] = [];

	// Split top-level declarators on commas that are NOT inside a destructuring
	// pattern. Track brace/bracket/paren depth so commas within `{...}`/`[...]`
	// stay grouped with their pattern.
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of declarators) {
		if (ch === '{' || ch === '[' || ch === '(') depth++;
		else if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
		if (ch === ',' && depth === 0) {
			parts.push(current);
			current = '';
		} else {
			current += ch;
		}
	}
	if (current.trim()) parts.push(current);

	for (const part of parts) {
		// Drop the initializer of this declarator: the binding side is the text
		// before the first top-level `=`. (Defaults inside a pattern, e.g.
		// `{ a = 1 }`, live at depth > 0 and are handled per-token below.)
		let lhs = part;
		let d = 0;
		for (let k = 0; k < part.length; k++) {
			const ch = part[k];
			if (ch === '{' || ch === '[' || ch === '(') d++;
			else if (ch === '}' || ch === ']' || ch === ')') d = Math.max(0, d - 1);
			else if (ch === '=' && d === 0 && part[k + 1] !== '=' && part[k - 1] !== '!') {
				lhs = part.slice(0, k);
				break;
			}
		}

		const trimmedLhs = lhs.trim();
		if (!trimmedLhs) continue;

		// Plain (non-destructured) declarator — `foo` or a type-annotated
		// `foo: SomeType`. Only the leading identifier is a binding; any `: Type`
		// annotation is erased at runtime, so capture just the head identifier.
		if (!trimmedLhs.startsWith('{') && !trimmedLhs.startsWith('[')) {
			const plain = trimmedLhs.match(/^([A-Za-z_$][\w$]*)/);
			if (plain?.[1]) {
				names.push(plain[1]);
			}
			continue;
		}

		// Destructuring pattern. Collect bound LOCAL names: in `{ key: local }`
		// the binding is `local`; in `{ key }` it is `key`; rest/defaults handled.
		// Strategy: tokenize identifiers, but exclude any identifier immediately
		// FOLLOWED by `:` (it is a property key, not a binding) and any default
		// value after `=` within the pattern (handled by skipping the value side).
		for (const name of extractPatternNames(trimmedLhs)) {
			names.push(name);
		}
	}

	return names;
}

/**
 * Collects bound LOCAL identifiers from a destructuring pattern string
 * (`{ ... }` / `[ ... ]`, possibly nested). Property keys (`key:` in
 * `{ key: local }`) and default-value expressions (after `=`) are excluded so
 * only the names actually introduced into scope are returned.
 */
function extractPatternNames(pattern: string): string[] {
	const names: string[] = [];
	let i = 0;
	let depth = 0;
	let entered = false;
	while (i < pattern.length) {
		const ch = pattern[i];
		if (ch === '{' || ch === '[' || ch === '(') {
			depth++;
			entered = true;
			i++;
			continue;
		}
		if (ch === '}' || ch === ']' || ch === ')') {
			depth = Math.max(0, depth - 1);
			i++;
			// Once the outermost pattern has closed, anything that follows is a
			// trailing type annotation (`{ foo }: Type`) — erased at runtime, not a
			// binding — so stop scanning.
			if (entered && depth === 0) break;
			continue;
		}
		// On a default `=`, skip its value expression up to the next top-level
		// (relative to this point) comma or closing delimiter.
		if (ch === '=' && pattern[i + 1] !== '=') {
			let d = 0;
			i++;
			while (i < pattern.length) {
				const c = pattern[i];
				if (c === '{' || c === '[' || c === '(') d++;
				else if (c === '}' || c === ']' || c === ')') {
					if (d === 0) break;
					d--;
				} else if (c === ',' && d === 0) break;
				i++;
			}
			continue;
		}
		// Identifier start.
		if (/[A-Za-z_$]/.test(ch ?? '')) {
			let j = i;
			while (j < pattern.length && /[\w$]/.test(pattern[j] ?? '')) j++;
			const ident = pattern.slice(i, j);
			// Look ahead past whitespace: a following `:` marks this as a property
			// KEY (the binding is its value), so skip it.
			let k = j;
			while (k < pattern.length && /\s/.test(pattern[k] ?? '')) k++;
			if (pattern[k] === ':') {
				i = j;
				continue;
			}
			names.push(ident);
			i = j;
			continue;
		}
		i++;
	}
	return names;
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
 *
 * `export const|let|var` bindings are decomposed into every name they bind, so
 * multi-declarator lists (`export const foo = 1, bar = 2`) and destructuring
 * patterns (`export const { foo } = obj` / `export const [a, b] = arr`,
 * including nested/aliased/default/rest forms) are each fully flagged rather
 * than only catching the first identifier. `function`/`class` declarations bind
 * exactly one name and are handled directly.
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

		// `export (async )?function NAME` / `export (class) NAME` — these forms
		// ALWAYS bind exactly one name and can never be multi-declarator or
		// destructured, so a single-identifier capture is correct.
		const fnClass = line.match(/^export\s+(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/);
		const fnClassName = fnClass?.[1];
		if (fnClassName) {
			if (!isAllowedName(fnClassName)) {
				disallowed.push(fnClassName);
			}
			continue;
		}

		// `export (const|let|var) <binding-list>` — a binding list may contain
		// multiple comma-separated declarators (`foo = 1, bar = 2`) and/or
		// destructuring patterns (`{ foo } = obj`, `[a, b] = arr`), each of which
		// introduces its own runtime export. Extract every bound name so none is
		// silently missed (the ISSUE-001 class of bug applies to each binding).
		const varDecl = line.match(/^export\s+(?:const|let|var)\s+([\s\S]+)$/);
		if (varDecl?.[1]) {
			for (const name of extractBoundNames(varDecl[1])) {
				if (!isAllowedName(name)) {
					disallowed.push(name);
				}
			}
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

	it('flags every declarator in a multi-declarator `export const a, b`', () => {
		expect(findDisallowedExports('export const foo = 1, bar = 2;')).toEqual(['foo', 'bar']);
	});

	it('flags a forbidden 2nd declarator even when the 1st is reserved', () => {
		// `load` is reserved (allowed); `bar` is not.
		expect(findDisallowedExports('export const load = () => {}, bar = 2;')).toEqual(['bar']);
	});

	it('does NOT flag a multi-declarator list of only reserved/`_`/allowed names', () => {
		expect(findDisallowedExports('export const load = () => {}, _x = 1, ssr = false;')).toEqual([]);
	});

	it('flags a forbidden name in object destructuring (`export const { foo }`)', () => {
		expect(findDisallowedExports('export const { foo } = obj;')).toEqual(['foo']);
		expect(findDisallowedExports('export const { foo, bar } = obj;')).toEqual(['foo', 'bar']);
	});

	it('flags the LOCAL (aliased) name in object destructuring, not the key', () => {
		// `export const { key: bar } = obj` binds `bar`, not `key`.
		expect(findDisallowedExports('export const { key: bar } = obj;')).toEqual(['bar']);
	});

	it('honors reserved names in object destructuring (`{ load }` passes)', () => {
		expect(findDisallowedExports('export const { load } = helper;')).toEqual([]);
		expect(findDisallowedExports('export const { helper: load } = mod;')).toEqual([]);
	});

	it('flags forbidden names in array destructuring (`export const [a, b]`)', () => {
		expect(findDisallowedExports('export const [a, b] = arr;')).toEqual(['a', 'b']);
	});

	it('does NOT flag default values or reserved bindings in a pattern', () => {
		// `_priv` is private; default value `fallback` is not a binding.
		expect(findDisallowedExports('export const { _priv = fallback } = obj;')).toEqual([]);
	});

	it('flags rest bindings in destructuring (`{ ...rest }`)', () => {
		expect(findDisallowedExports('export const { ...rest } = obj;')).toEqual(['rest']);
	});

	it('ignores a trailing type annotation on a destructured binding', () => {
		// `{ foo }: SomeType` binds `foo`; `SomeType` is erased at runtime.
		expect(findDisallowedExports('export const { foo }: SomeType = obj;')).toEqual(['foo']);
	});

	it('flags nested destructuring bindings', () => {
		expect(findDisallowedExports('export const { a: { b } } = obj;')).toEqual(['b']);
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
