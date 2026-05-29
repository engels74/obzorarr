#!/usr/bin/env bun

/**
 * Theme-token drift check (Principle 5 of the v3 UI overhaul plan).
 *
 * The plan's preferred implementation pulls `bunx shadcn@latest add` for the
 * 4 tweakcn registry themes and diffs the result against src/app.css. That
 * approach needs:
 *   1. Stable tweakcn URLs for `modern-minimal`, `supabase`, `doom-64`,
 *      `amber-minimal`.
 *   2. Network access in CI.
 *   3. A consistent canonicalisation rule (so app-specific tokens — slide
 *      gradients, primary-wheel triples — don't fire false positives).
 *
 * This implementation is the pragmatic local-only variant: it hashes the
 * canonical token set per theme and compares against a committed baseline at
 * `tests/fixtures/oklch-baseline.json`. Any drift in token VALUES (or token
 * NAMES) trips the CI gate. The check is deterministic and offline.
 *
 * Usage:
 *   bun run check:tweakcn-drift            # compares against baseline
 *   bun run check:tweakcn-drift --update   # writes new baseline
 *
 * Migration path: once the maintainer supplies tweakcn URLs, replace the
 * `baseline.json` check with a `bunx shadcn add <url>` round-trip diff.
 * The CLI signature stays the same.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS_PATH = resolve(import.meta.dirname, '..', 'src', 'app.css');
const BASELINE_PATH = resolve(
	import.meta.dirname,
	'..',
	'tests',
	'fixtures',
	'oklch-baseline.json'
);

type TokenMap = Record<string, string>;
type ThemeManifest = {
	hash: string;
	tokens: TokenMap;
};
type Manifest = Record<string, ThemeManifest>;

const THEMES = [
	'modern-minimal',
	'supabase',
	'doom-64',
	'amber-minimal',
	'soviet-red',
	'obsidian-premium',
	'aurora-premium',
	'champagne-premium'
] as const;

const REGISTRY_THEMES = new Set(['modern-minimal', 'supabase', 'doom-64', 'amber-minimal']);

/**
 * Parse a theme block out of app.css. A theme block starts at
 * `html[data-theme="<name>"]` (or `:root` for the default) and ends at the
 * matching closing `}` at column 1.
 */
function extractThemeTokens(css: string, theme: string): TokenMap {
	const selector =
		theme === 'modern-minimal'
			? /:root\s*\{/g
			: new RegExp(`html\\[data-theme=["']${theme}["']\\]\\s*,\\s*\\.theme-${theme}\\s*\\{`, 'g');

	const match = selector.exec(css);
	if (!match) {
		throw new Error(`Could not locate theme block for "${theme}"`);
	}
	const start = match.index + match[0].length;

	// Walk to the matching `}` at depth 0.
	let depth = 1;
	let i = start;
	while (i < css.length && depth > 0) {
		const ch = css[i];
		if (ch === '{') depth += 1;
		else if (ch === '}') depth -= 1;
		i += 1;
	}
	if (depth !== 0) {
		throw new Error(`Unterminated theme block for "${theme}"`);
	}
	const body = css.slice(start, i - 1);

	const tokens: TokenMap = {};
	const declRe = /^\s*(--[a-z][a-z0-9-]*)\s*:\s*([^;]+?);\s*$/gm;
	let dm = declRe.exec(body);
	while (dm) {
		tokens[dm[1]] = dm[2].trim();
		dm = declRe.exec(body);
	}
	return tokens;
}

function hashTokens(tokens: TokenMap): string {
	const keys = Object.keys(tokens).sort();
	const canonical = keys.map((k) => `${k}=${tokens[k]}`).join('\n');
	return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function buildManifest(css: string): Manifest {
	const out: Manifest = {};
	for (const theme of THEMES) {
		const tokens = extractThemeTokens(css, theme);
		out[theme] = { hash: hashTokens(tokens), tokens };
	}
	return out;
}

function diffManifests(current: Manifest, baseline: Manifest): string[] {
	const issues: string[] = [];
	for (const theme of THEMES) {
		const c = current[theme];
		const b = baseline[theme];
		if (!b) {
			issues.push(`[${theme}] baseline missing — run with --update to seed`);
			continue;
		}
		if (c.hash === b.hash) continue;

		const cKeys = new Set(Object.keys(c.tokens));
		const bKeys = new Set(Object.keys(b.tokens));
		const added = [...cKeys].filter((k) => !bKeys.has(k));
		const removed = [...bKeys].filter((k) => !cKeys.has(k));
		const changed: string[] = [];
		for (const k of cKeys) {
			if (bKeys.has(k) && c.tokens[k] !== b.tokens[k]) {
				changed.push(`${k}: ${b.tokens[k]} -> ${c.tokens[k]}`);
			}
		}

		const flag = REGISTRY_THEMES.has(theme) ? '[REGISTRY DRIFT]' : '[BESPOKE DRIFT]';
		issues.push(`${flag} ${theme} (hash ${b.hash.slice(0, 8)} -> ${c.hash.slice(0, 8)}):`);
		if (added.length) issues.push(`  added:   ${added.join(', ')}`);
		if (removed.length) issues.push(`  removed: ${removed.join(', ')}`);
		for (const c of changed) issues.push(`  changed: ${c}`);
	}
	return issues;
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const update = args.includes('--update');

	const css = readFileSync(CSS_PATH, 'utf8');
	const current = buildManifest(css);

	if (update) {
		const dir = resolve(import.meta.dirname, '..', 'tests', 'fixtures');
		if (!existsSync(dir)) {
			throw new Error(`Baseline directory missing: ${dir}`);
		}
		writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
		console.log(`Wrote baseline for ${THEMES.length} themes -> ${BASELINE_PATH}`);
		return;
	}

	if (!existsSync(BASELINE_PATH)) {
		console.error(`No baseline at ${BASELINE_PATH}. Run with --update to seed.`);
		process.exit(2);
	}

	const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Manifest;
	const issues = diffManifests(current, baseline);

	if (issues.length === 0) {
		console.log(`✓ tweakcn-drift: no drift across ${THEMES.length} themes`);
		return;
	}
	console.error('✗ tweakcn-drift: drift detected');
	for (const line of issues) console.error(line);
	console.error('\nIf the drift is intentional, run: bun run check:tweakcn-drift -- --update');
	process.exit(1);
}

await main();
