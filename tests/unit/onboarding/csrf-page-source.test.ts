import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const pageSourcePath = join(
	import.meta.dir,
	'..',
	'..',
	'..',
	'src/routes/onboarding/csrf/+page.svelte'
);

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readPageSource(): Promise<string> {
	return Bun.file(pageSourcePath).text();
}

function findPostForm(source: string, action: string, className: string): string {
	const escapedAction = escapeRegExp(action);
	const escapedClassName = escapeRegExp(className);
	const formPattern = new RegExp(
		`<form\\b(?=[^>]*\\bmethod="POST")(?=[^>]*\\baction="${escapedAction}")(?=[^>]*\\bclass="[^"]*\\b${escapedClassName}\\b[^"]*")[^>]*>[\\s\\S]*?<\\/form>`
	);

	return source.match(formPattern)?.[0] ?? '';
}

function expectNoClickBridge(formSource: string): void {
	expect(formSource).not.toMatch(/\bonclick\s*=|\bon:click\b/);
}

describe('onboarding CSRF page source', () => {
	it('does not reintroduce custom submit bridging for native footer forms', async () => {
		const source = await readPageSource();
		const skipForm = findPostForm(source, '?/skipCsrf', 'skip-form');
		const saveForm = findPostForm(source, '?/saveOrigin', 'save-form');

		expectNoClickBridge(skipForm);
		expectNoClickBridge(saveForm);
	});

	it('keeps native skip and save form actions in the footer', async () => {
		const source = await readPageSource();
		const skipForm = findPostForm(source, '?/skipCsrf', 'skip-form');
		const saveForm = findPostForm(source, '?/saveOrigin', 'save-form');

		expect(skipForm).toContain('type="submit"');
		expect(skipForm).toContain('formnovalidate');
		expect(saveForm).toContain('type="submit"');
	});

	it('runs onboarding reverse proxy diagnostics through the CSRF page action only', async () => {
		const source = await readPageSource();

		expect(source).toContain("fetch('?/diagnoseReverseProxy'");
		expect(source).toContain('action="?/enableTrustProxy"');
		expect(source).not.toContain('/api/security');
	});

	it('prevents duplicate in-flight diagnostic checks and keeps enable confirmation explicit', async () => {
		const source = await readPageSource();
		const enableForm = findPostForm(source, '?/enableTrustProxy', 'trust-proxy-enable-form');

		expect(source).toContain("if (diagnosticStatus === 'checking') return;");
		expect(source).toContain('hasRunInitialDiagnostic');
		expect(enableForm).toContain('name="confirmRisk"');
		expect(enableForm).toContain('type="checkbox"');
		expect(enableForm).toContain('required');
		expect(enableForm).toContain('name="browserOrigin"');
	});
});
