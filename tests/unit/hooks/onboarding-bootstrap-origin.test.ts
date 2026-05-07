import { describe, expect, it } from 'bun:test';

describe('hooks onboarding bootstrap banner origin', () => {
	it('does not pass request-derived origin to the bootstrap banner', async () => {
		const source = await Bun.file('src/hooks.server.ts').text();

		expect(source).toContain('await printOnboardingBootstrapBanner();');
		expect(source).not.toContain('printOnboardingBootstrapBanner(event.url.origin');
	});
});
