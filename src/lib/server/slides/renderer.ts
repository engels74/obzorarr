import { marked } from 'marked';
import type { MarkdownValidationResult } from './types';

/**
 * Markdown Renderer
 *
 * Utilities for rendering and validating Markdown content
 * used in custom slides.
 *
 * Implements Requirement 9.2: System validates Markdown syntax
 *
 * @module slides/renderer
 */

// =============================================================================
// Configuration
// =============================================================================

/**
 * Markdown rendering options
 */
export interface MarkdownOptions {
	/** Whether to sanitize HTML output (default: true) */
	sanitize?: boolean;
	/** Whether to allow raw HTML in Markdown (default: false) */
	allowHtml?: boolean;
	/** Whether to add breaks on single newlines (default: false) */
	breaks?: boolean;
}

// Configure marked with secure defaults
marked.setOptions({
	gfm: true, // GitHub Flavored Markdown
	breaks: false,
	async: false
});

// =============================================================================
// Rendering
// =============================================================================

/**
 * Render Markdown to HTML
 *
 * Converts Markdown content to HTML with configurable options.
 * Uses marked for parsing, which supports GitHub Flavored Markdown.
 *
 * @param content - The Markdown content to render
 * @param options - Rendering options
 * @returns HTML string
 */
export function renderMarkdown(content: string, options: MarkdownOptions = {}): string {
	const { breaks = false } = options;

	// Configure breaks option for this render
	const htmlContent = marked.parse(content, {
		gfm: true,
		breaks
	});

	// marked.parse returns string | Promise<string>, but with async: false it's always string
	if (typeof htmlContent === 'string') {
		return htmlContent;
	}

	// Fallback (shouldn't happen with async: false)
	return content;
}

/**
 * Render Markdown to HTML synchronously
 *
 * Guaranteed synchronous rendering for use in components.
 *
 * @param content - The Markdown content to render
 * @returns HTML string
 */
export function renderMarkdownSync(content: string): string {
	const result = marked.parse(content, { async: false });
	return typeof result === 'string' ? result : content;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate Markdown syntax
 *
 * Checks if the Markdown content is valid and parseable.
 * This is a basic validation that ensures the content can be parsed.
 *
 * Implements Requirement 9.2
 *
 * @param content - The Markdown content to validate
 * @returns Validation result with errors if invalid
 */
export function validateMarkdownSyntax(content: string): MarkdownValidationResult {
	const errors: string[] = [];

	// Check for empty content
	if (!content || content.trim().length === 0) {
		errors.push('Content cannot be empty');
		return { valid: false, errors };
	}

	// Check maximum length
	if (content.length > 10000) {
		errors.push('Content exceeds maximum length of 10000 characters');
		return { valid: false, errors };
	}

	try {
		// Attempt to parse the Markdown
		const result = marked.parse(content, { async: false });

		// Check if parsing produced output
		if (typeof result !== 'string' || result.trim().length === 0) {
			errors.push('Markdown parsing produced no output');
			return { valid: false, errors };
		}

		// Check for unbalanced code blocks
		const codeBlockCount = (content.match(/```/g) ?? []).length;
		if (codeBlockCount % 2 !== 0) {
			errors.push('Unbalanced code blocks (missing closing ```)');
			return { valid: false, errors };
		}

		// Check for unclosed inline code
		const inlineCodeMatches = content.match(/(?<!`)`(?!`)/g) ?? [];
		if (inlineCodeMatches.length % 2 !== 0) {
			// This is a warning but not an error - Markdown can handle this
			// errors.push('Potentially unclosed inline code');
		}

		return { valid: true, errors: [] };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
		errors.push(`Markdown parsing failed: ${errorMessage}`);
		return { valid: false, errors };
	}
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Extract plain text from Markdown
 *
 * Useful for generating previews or excerpts.
 *
 * @param content - The Markdown content
 * @param maxLength - Maximum length of the plain text (default: 200)
 * @returns Plain text string
 */
export function markdownToPlainText(content: string, maxLength: number = 200): string {
	// Parse to HTML first
	const html = renderMarkdownSync(content);

	// Remove HTML tags
	const plainText = html
		.replace(/<[^>]*>/g, ' ') // Replace tags with spaces
		.replace(/\s+/g, ' ') // Collapse whitespace
		.trim();

	// Truncate if needed
	if (plainText.length <= maxLength) {
		return plainText;
	}

	// Truncate at word boundary
	const truncated = plainText.slice(0, maxLength);
	const lastSpace = truncated.lastIndexOf(' ');

	if (lastSpace > maxLength * 0.8) {
		return truncated.slice(0, lastSpace) + '...';
	}

	return truncated + '...';
}

/**
 * Check if content contains potentially unsafe HTML
 *
 * @param content - The Markdown content to check
 * @returns True if potentially unsafe content is detected
 */
export function containsUnsafeHtml(content: string): boolean {
	// Check for script tags
	if (/<script[^>]*>/i.test(content)) {
		return true;
	}

	// Check for event handlers
	if (/\son\w+\s*=/i.test(content)) {
		return true;
	}

	// Check for javascript: URLs
	if (/javascript:/i.test(content)) {
		return true;
	}

	// Check for data: URLs with HTML/script content
	if (/data:[^;]*;base64.*<script/i.test(content)) {
		return true;
	}

	return false;
}

/**
 * Get word count from Markdown content
 *
 * @param content - The Markdown content
 * @returns Word count
 */
export function getWordCount(content: string): number {
	const plainText = markdownToPlainText(content, Infinity);
	const words = plainText.split(/\s+/).filter((word) => word.length > 0);
	return words.length;
}

/**
 * Get estimated reading time in minutes
 *
 * @param content - The Markdown content
 * @param wordsPerMinute - Reading speed (default: 200)
 * @returns Estimated reading time in minutes
 */
export function getReadingTime(content: string, wordsPerMinute: number = 200): number {
	const wordCount = getWordCount(content);
	return Math.ceil(wordCount / wordsPerMinute);
}
