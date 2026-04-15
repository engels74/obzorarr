import { describe, expect, it } from 'bun:test';

const pageSourcePath = 'src/routes/onboarding/csrf/+page.svelte';

async function readPageSource(): Promise<string> {
	return Bun.file(pageSourcePath).text();
}

describe('onboarding CSRF page source', () => {
	it('does not reintroduce custom submit bridging for native footer forms', async () => {
		const source = await readPageSource();

		expect(source).not.toContain('requestSubmit');
		expect(source).not.toContain('submitButtonForm');
		expect(source).not.toContain('onclick={submitButtonForm}');
	});

	it('keeps native skip and save form actions in the footer', async () => {
		const source = await readPageSource();

		expect(source).toContain('<form method="POST" action="?/skipCsrf"');
		expect(source).toContain('<form method="POST" action="?/saveOrigin"');
		expect(source).toContain('formnovalidate');
	});
});
