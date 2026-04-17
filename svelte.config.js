import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import adapter from 'svelte-adapter-bun';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		csp: {
			mode: 'nonce',
			directives: {
				'default-src': ['self'],
				'img-src': ['self', 'https://plex.tv', 'https://*.plex.direct', 'data:'],
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				'font-src': ['self', 'https://fonts.gstatic.com'],
				'script-src': ['self'],
				'connect-src': ['self', 'https://plex.tv'],
				'frame-ancestors': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		},
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
