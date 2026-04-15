import { sveltekit } from '@sveltejs/kit/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import UnoCSS from 'unocss/vite';
import { defineConfig, type PluginOption } from 'vite';
import {
	isBlockedPath,
	isBlockedUserAgent
} from './src/lib/server/security/request-filter-patterns';

const rolldownChecks = { pluginTimings: false } as Record<string, boolean>;

function devRequestFilter(): PluginOption {
	return {
		name: 'obzorarr-dev-request-filter',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const path = new URL(req.url ?? '/', 'http://localhost').pathname;
				const userAgent = req.headers['user-agent'];
				const userAgentValue = Array.isArray(userAgent) ? userAgent.join(' ') : (userAgent ?? '');

				if (isBlockedPath(path)) {
					res.statusCode = 404;
					res.end('Not Found');
					return;
				}

				if (isBlockedUserAgent(userAgentValue)) {
					res.statusCode = 403;
					res.end('Forbidden');
					return;
				}

				next();
			});
		}
	};
}

export default defineConfig({
	build: {
		rollupOptions: {
			checks: rolldownChecks
		}
	},
	plugins: [
		UnoCSS(),
		devRequestFilter(),
		sveltekit(),
		process.env.ANALYZE
			? visualizer({
					filename: 'bundle-stats.html',
					gzipSize: true,
					brotliSize: true,
					open: false
				})
			: null
	].filter(Boolean) as PluginOption[]
});
