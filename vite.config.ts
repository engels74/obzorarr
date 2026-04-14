import { sveltekit } from '@sveltejs/kit/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import UnoCSS from 'unocss/vite';
import { defineConfig, type PluginOption } from 'vite';

const rolldownChecks = { pluginTimings: false } as Record<string, boolean>;

export default defineConfig({
	build: {
		rollupOptions: {
			checks: rolldownChecks
		}
	},
	plugins: [
		UnoCSS(),
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
