import adapter from 'svelte-adapter-bun';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			out: 'build',
			precompress: true,
			dynamic_origin: true,
			xff_depth: 1,
			protocol_header: 'x-forwarded-proto',
			host_header: 'x-forwarded-host'
		})
	}
};

export default config;
