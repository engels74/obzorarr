import { marked } from 'marked';
import type { MarkdownValidationResult } from './types';

export interface MarkdownOptions {
	sanitize?: boolean;
	allowHtml?: boolean;
	breaks?: boolean;
}

marked.setOptions({
	gfm: true,
	breaks: false,
	async: false
});

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

export function renderMarkdownSync(content: string): string {
	const result = marked.parse(content, { async: false });
	return typeof result === 'string' ? result : content;
}

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

export function getWordCount(content: string): number {
	const plainText = markdownToPlainText(content, Infinity);
	const words = plainText.split(/\s+/).filter((word) => word.length > 0);
	return words.length;
}

export function getReadingTime(content: string, wordsPerMinute: number = 200): number {
	const wordCount = getWordCount(content);
	return Math.ceil(wordCount / wordsPerMinute);
}
