import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			out: 'build',
			precompress: true,
			dynamic_origin: true
		}),
		csrf: {
			// Origin checking is incompatible with reverse proxy deployments.
			// CSRF protection is maintained via SameSite=Lax cookies.
			checkOrigin: false
		}
	}
};

export default config;
