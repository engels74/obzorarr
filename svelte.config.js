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
				'script-src-attr': ['unsafe-hashes', 'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I='],
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
			// Obzorarr enforces configured-origin checks in csrfHandle. SvelteKit's
			// built-in form-origin gate is disabled here to preserve the dedicated
			// self-repair path; SameSite=Lax cookies remain defense in depth.
			trustedOrigins: ['*']
		}
	}
};

export default config;
