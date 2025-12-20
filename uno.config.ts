import {
	defineConfig,
	presetIcons,
	presetTypography,
	presetUno,
	transformerDirectives,
	transformerVariantGroup
} from 'unocss';
import presetAnimations from 'unocss-preset-animations';
import { presetShadcn } from 'unocss-preset-shadcn';

export default defineConfig({
	presets: [
		presetUno(),
		presetIcons({
			scale: 1.2,
			extraProperties: {
				display: 'inline-block',
				'vertical-align': 'middle'
			}
		}),
		presetTypography(),
		presetAnimations(),
		presetShadcn({
			color: 'red' // Soviet red as base theme
		})
	],
	transformers: [transformerDirectives(), transformerVariantGroup()],
	content: {
		pipeline: {
			include: [
				// SvelteKit
				'./src/**/*.{html,js,svelte,ts}',
				// shadcn-svelte components
				'./node_modules/bits-ui/**/*.{html,js,svelte,ts}'
			]
		}
	},
	// Soviet/Communist theme CSS variables
	theme: {
		colors: {
			// Override shadcn colors with Soviet theme
			soviet: {
				red: '#CC0000',
				gold: '#FFD700',
				darkRed: '#8B0000',
				charcoal: '#1a1a1a',
				black: '#0d0d0d'
			}
		}
	}
});
