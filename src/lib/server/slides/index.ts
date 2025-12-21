/**
 * Slides Server Module
 *
 * Provides server-side functionality for managing slide configurations
 * and custom Markdown slides.
 *
 * @module slides
 */

// Types
export * from './types';

// Config service
export {
	initializeDefaultSlideConfig,
	getAllSlideConfigs,
	getSlideConfigByType,
	getEnabledSlides,
	updateSlideConfig,
	reorderSlides,
	toggleSlide,
	resetToDefaultConfig
} from './config.service';

// Custom slides service
export {
	createCustomSlide,
	getAllCustomSlides,
	getEnabledCustomSlides,
	getCustomSlideById,
	updateCustomSlide,
	toggleCustomSlide,
	deleteCustomSlide,
	validateMarkdown,
	getNextSortOrder
} from './custom.service';

// Renderer
export {
	renderMarkdown,
	renderMarkdownSync,
	validateMarkdownSyntax,
	markdownToPlainText,
	containsUnsafeHtml,
	getWordCount,
	getReadingTime
} from './renderer';

// Utilities
export { buildSlideRenderConfigs, customSlidesToMap, intersperseFunFacts } from './utils';
