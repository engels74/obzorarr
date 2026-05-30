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
				'img-src': [
					'self',
					'https://plex.tv',
					'https://*.plex.direct',
					'https://secure.gravatar.com',
					// Plex proxies some user avatars through WordPress/Gravatar's image CDN
					// (i0.wp.com); without this the avatar is blocked and logs a CSP
					// violation on /admin (ISSUE-002).
					'https://i0.wp.com',
					'data:'
				],
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
