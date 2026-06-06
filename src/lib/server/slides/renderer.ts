import { marked } from 'marked';
import { sanitizeMarkdownHtml } from './sanitize';
import type { MarkdownValidationResult } from './types';

export interface MarkdownOptions {
	breaks?: boolean;
}

marked.setOptions({
	gfm: true,
	breaks: false,
	async: false
});

export function renderMarkdown(content: string, options: MarkdownOptions = {}): string {
	const { breaks = false } = options;

	const htmlContent = marked.parse(content, {
		gfm: true,
		breaks
	});

	if (typeof htmlContent === 'string') {
		return sanitizeMarkdownHtml(htmlContent);
	}

	return sanitizeMarkdownHtml(content);
}

export function renderMarkdownSync(content: string): string {
	const result = marked.parse(content, { async: false });
	const html = typeof result === 'string' ? result : content;
	return sanitizeMarkdownHtml(html);
}

export function validateMarkdownSyntax(content: string): MarkdownValidationResult {
	const errors: string[] = [];

	if (!content || content.trim().length === 0) {
		errors.push('Content cannot be empty');
		return { valid: false, errors };
	}

	if (content.length > 10000) {
		errors.push('Content exceeds maximum length of 10000 characters');
		return { valid: false, errors };
	}

	try {
		const result = marked.parse(content, { async: false });

		if (typeof result !== 'string' || result.trim().length === 0) {
			errors.push('Markdown parsing produced no output');
			return { valid: false, errors };
		}

		const codeBlockCount = (content.match(/```/g) ?? []).length;
		if (codeBlockCount % 2 !== 0) {
			errors.push('Unbalanced code blocks (missing closing ```)');
			return { valid: false, errors };
		}

		const inlineCodeMatches = content.match(/(?<!`)`(?!`)/g) ?? [];
		if (inlineCodeMatches.length % 2 !== 0) {
			// CommonMark treats unmatched single backticks as literal text; only
			// fenced code blocks are strict enough here to reject author input.
		}

		return { valid: true, errors: [] };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
		errors.push(`Markdown parsing failed: ${errorMessage}`);
		return { valid: false, errors };
	}
}

export function markdownToPlainText(content: string, maxLength: number = 200): string {
	const html = renderMarkdownSync(content);

	const plainText = html
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	if (plainText.length <= maxLength) {
		return plainText;
	}

	const truncated = plainText.slice(0, maxLength);
	const lastSpace = truncated.lastIndexOf(' ');

	if (lastSpace > maxLength * 0.8) {
		return `${truncated.slice(0, lastSpace)}...`;
	}

	return `${truncated}...`;
}

export type UnsafeHtmlDetection = { unsafe: true; reason: string } | { unsafe: false };

/**
 * Classifies why slide content is rejected as unsafe HTML, so each detection
 * branch surfaces an actionable, non-leaky hint inline under the content field
 * (ISSUE-006) instead of one generic message. The four regexes and their order
 * are unchanged from the prior boolean `containsUnsafeHtml` — detection strength
 * is identical; only the returned reason is branch-specific. Messages stay
 * generic enough not to echo the user's exact payload verbatim.
 */
export function detectUnsafeHtml(content: string): UnsafeHtmlDetection {
	if (/<script[^>]*>/i.test(content)) {
		return {
			unsafe: true,
			reason: "Remove <script> tags — inline scripts aren't allowed in slide content."
		};
	}

	if (/\son\w+\s*=/i.test(content)) {
		return {
			unsafe: true,
			reason: 'Remove inline event handlers (e.g. onclick, onerror) from your HTML.'
		};
	}

	if (/javascript:/i.test(content)) {
		return { unsafe: true, reason: 'Remove javascript: URLs from links or images.' };
	}

	if (/data:[^;]*;base64.*<script/i.test(content)) {
		return { unsafe: true, reason: 'Remove embedded base64 scripts from your content.' };
	}

	return { unsafe: false };
}

export function containsUnsafeHtml(content: string): boolean {
	return detectUnsafeHtml(content).unsafe;
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
