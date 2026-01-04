import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from 'svelte-adapter-bun';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			out: 'build',
			precompress: true
		}),
		csrf: {
			// Origin checking is incompatible with reverse proxy deployments.
			// CSRF protection is maintained via SameSite=Lax cookies.
			trustedOrigins: ['*']
		}
	}
};

export default config;
