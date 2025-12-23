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
	// Safelist classes that are used in portalled components (AlertDialog, etc.)
	// These need to be safelisted because UnoCSS may not detect them when content is dynamically portalled
	safelist: [
		'fixed',
		'inset-0',
		'left-[50%]',
		'top-[50%]',
		'z-[100]',
		'translate-x-[-50%]',
		'translate-y-[-50%]',
		'bg-black/80',
		'grid',
		'w-full',
		'max-w-lg',
		'gap-4',
		'border',
		'border-border',
		'bg-background',
		'p-6',
		'shadow-lg',
		'duration-200',
		'sm:rounded-lg',
		'animate-in',
		'animate-out',
		'fade-in-0',
		'fade-out-0',
		'zoom-in-95',
		'zoom-out-95',
		'slide-in-from-left-1/2',
		'slide-in-from-top-[48%]',
		'slide-out-to-left-1/2',
		'slide-out-to-top-[48%]'
	],
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
