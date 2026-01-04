import { sveltekit } from '@sveltejs/kit/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import UnoCSS from 'unocss/vite';
import { defineConfig, type PluginOption } from 'vite';

export default defineConfig({
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
