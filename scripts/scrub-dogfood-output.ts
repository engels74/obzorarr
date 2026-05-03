import { lstat, mkdir, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SECRET_KEYS = [
	'PLEX_SERVER_URL',
	'PLEX_TOKEN',
	'PLEX_ADMIN_USER_EMAIL',
	'PLEX_ADMIN_USER_PASSWORD',
	'PLEX_TEST_USER_EMAIL',
	'PLEX_TEST_USER_PASSWORD'
] as const;

const TEXT_EXTENSIONS = new Set([
	'.csv',
	'.html',
	'.json',
	'.log',
	'.md',
	'.txt',
	'.tsv',
	'.xml',
	'.yaml',
	'.yml'
]);

const envPath = path.resolve(process.cwd(), '.env');
const outputRoot = path.resolve(process.cwd(), 'dogfood-output');
const writeChanges = Bun.argv.includes('--write');

type Secret = {
	key: (typeof SECRET_KEYS)[number];
	value: string;
	placeholder: string;
};

function parseEnv(content: string): Map<string, string> {
	const values = new Map<string, string>();
	for (const line of content.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const equalsIndex = trimmed.indexOf('=');
		if (equalsIndex === -1) continue;

		const key = trimmed.slice(0, equalsIndex).trim();
		let value = trimmed.slice(equalsIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		values.set(key, value);
	}
	return values;
}

function redactText(text: string, secrets: Secret[]): { text: string; keys: string[] } {
	let redacted = text;
	const found = new Set<string>();

	for (const secret of secrets) {
		if (!redacted.includes(secret.value)) continue;
		redacted = redacted.split(secret.value).join(secret.placeholder);
		found.add(secret.key);
	}

	return { text: redacted, keys: [...found] };
}

async function listFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await listFiles(fullPath)));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}

	return files;
}

async function isLikelyTextFile(filePath: string): Promise<boolean> {
	if (TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return true;

	const stat = await lstat(filePath);
	if (stat.size > 1024 * 1024) return false;

	const bytes = new Uint8Array(await Bun.file(filePath).slice(0, 4096).arrayBuffer());
	return !bytes.includes(0);
}

function redactedPath(filePath: string, secrets: Secret[]): { filePath: string; keys: string[] } {
	let nextPath = path.relative(outputRoot, filePath);
	const found = new Set<string>();

	for (const secret of secrets) {
		if (!nextPath.includes(secret.value)) continue;
		nextPath = nextPath.split(secret.value).join(secret.placeholder);
		found.add(secret.key);
	}

	return { filePath: path.join(outputRoot, nextPath), keys: [...found] };
}

const envFile = Bun.file(envPath);
if (!(await envFile.exists())) {
	console.error('No .env file found; cannot compare dogfood artifacts against runtime secrets.');
	process.exit(1);
}

const envValues = parseEnv(await envFile.text());
const secrets = SECRET_KEYS.map((key) => {
	const value = envValues.get(key)?.trim() ?? '';
	return value ? { key, value, placeholder: `<${key}>` } : null;
})
	.filter((secret): secret is Secret => secret !== null)
	.sort((a, b) => b.value.length - a.value.length);

if (secrets.length === 0) {
	console.error('No configured secret values found in .env.');
	process.exit(1);
}

const files = await listFiles(outputRoot);
const findings: Array<{ file: string; keys: string[]; type: 'content' | 'filename' }> = [];

for (const filePath of files) {
	let currentPath = filePath;
	const pathResult = redactedPath(filePath, secrets);
	if (pathResult.keys.length > 0) {
		findings.push({ file: filePath, keys: pathResult.keys, type: 'filename' });
		if (writeChanges) {
			await mkdir(path.dirname(pathResult.filePath), { recursive: true });
			await rename(filePath, pathResult.filePath);
			currentPath = pathResult.filePath;
		}
	}

	if (!(await isLikelyTextFile(currentPath))) continue;

	const original = await Bun.file(currentPath).text();
	const result = redactText(original, secrets);
	if (result.keys.length === 0) continue;

	findings.push({ file: currentPath, keys: result.keys, type: 'content' });
	if (writeChanges) {
		await writeFile(currentPath, result.text);
	}
}

if (findings.length === 0) {
	console.log('No configured .env secrets found in dogfood-output text artifacts or filenames.');
	process.exit(0);
}

for (const finding of findings) {
	console.log(
		`${writeChanges ? 'Redacted' : 'Found'} ${finding.type} secret(s) ${finding.keys.join(', ')} in ${path.relative(process.cwd(), finding.file)}`
	);
}

if (!writeChanges) {
	console.error('Run `bun run dogfood:scrub -- --write` to redact text artifacts.');
	process.exit(1);
}
