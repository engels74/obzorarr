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
		// Dialog container/overlay
		'fixed',
		'inset-0',
		'left-[50%]',
		'top-[50%]',
		'z-[100]',
		// Tooltip z-index (portalled content needs explicit safelist)
		'z-[9999]',
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
		// Animations
		'animate-in',
		'animate-out',
		'fade-in-0',
		'fade-out-0',
		'zoom-in-95',
		'zoom-out-95',
		'slide-in-from-left-1/2',
		'slide-in-from-top-[48%]',
		'slide-out-to-left-1/2',
		'slide-out-to-top-[48%]',
		// AlertDialog Header
		'flex',
		'flex-col',
		'space-y-2',
		'text-center',
		'sm:text-left',
		// AlertDialog Footer
		'flex-col-reverse',
		'sm:flex-row',
		'sm:justify-end',
		'sm:space-x-2',
		// AlertDialog Title
		'text-lg',
		'font-semibold',
		// AlertDialog Description
		'text-sm',
		'text-muted-foreground',
		// Button base styles
		'inline-flex',
		'h-10',
		'items-center',
		'justify-center',
		'rounded-md',
		'px-4',
		'py-2',
		'ring-offset-background',
		'transition-colors',
		'gap-2',
		// AlertDialog Action (destructive button)
		'bg-destructive',
		'text-destructive-foreground',
		'hover:bg-destructive/90',
		// AlertDialog Cancel (secondary button)
		'border-input',
		'hover:bg-accent',
		'hover:text-accent-foreground',
		// Focus states
		'focus-visible:outline-none',
		'focus-visible:ring-2',
		'focus-visible:ring-ring',
		'focus-visible:ring-offset-2',
		// Disabled states
		'disabled:pointer-events-none',
		'disabled:opacity-50'
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
			color: 'blue' // Modern Minimal as base theme
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
	// Theme colors are defined in app.css using oklch for maximum flexibility
	theme: {
		// Extend default theme as needed
	}
});
