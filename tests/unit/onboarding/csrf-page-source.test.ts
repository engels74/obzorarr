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

function findPostForm(source: string, action: string): string {
	const escapedAction = escapeRegExp(action);
	const formPattern = new RegExp(
		`<form\\b(?=[^>]*\\bmethod="POST")(?=[^>]*\\baction="${escapedAction}")[^>]*>[\\s\\S]*?<\\/form>`
	);

	return source.match(formPattern)?.[0] ?? '';
}

describe('onboarding CSRF page source', () => {
	it('does not reintroduce custom submit bridging for native footer forms', async () => {
		const source = await readPageSource();
		const skipForm = findPostForm(source, '?/skipCsrf');
		const saveForm = findPostForm(source, '?/saveOrigin');

		expect(skipForm).not.toContain('onclick=');
		expect(saveForm).not.toContain('onclick=');
	});

	it('keeps native skip and save form actions in the footer', async () => {
		const source = await readPageSource();
		const skipForm = findPostForm(source, '?/skipCsrf');
		const saveForm = findPostForm(source, '?/saveOrigin');

		expect(skipForm).toContain('type="submit"');
		expect(skipForm).toContain('formnovalidate');
		expect(saveForm).toContain('type="submit"');
	});
});
