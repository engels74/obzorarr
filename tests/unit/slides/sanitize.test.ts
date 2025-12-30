import { describe, expect, test } from 'bun:test';
import { sanitizeMarkdownHtml, SANITIZE_OPTIONS } from '$lib/server/slides/sanitize';

describe('sanitizeMarkdownHtml', () => {
	describe('XSS prevention', () => {
		test('removes script tags', () => {
			const input = '<p>Hello</p><script>alert("xss")</script>';
			expect(sanitizeMarkdownHtml(input)).toBe('<p>Hello</p>');
		});

		test('removes script tags with attributes', () => {
			const input = '<script src="evil.js"></script><p>Text</p>';
			expect(sanitizeMarkdownHtml(input)).toBe('<p>Text</p>');
		});

		test('removes event handlers from allowed tags', () => {
			const input = '<img src="image.jpg" onerror="alert(1)">';
			const result = sanitizeMarkdownHtml(input);
			expect(result).not.toContain('onerror');
			expect(result).toContain('src="image.jpg"');
		});

		test('removes onclick handlers', () => {
			const input = '<a href="https://example.com" onclick="evil()">Link</a>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).not.toContain('onclick');
			expect(result).toContain('href="https://example.com"');
		});

		test('removes javascript: URLs from links', () => {
			const input = '<a href="javascript:alert(1)">click</a>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).not.toContain('javascript:');
		});

		test('removes javascript: URLs from images', () => {
			const input = '<img src="javascript:alert(1)">';
			const result = sanitizeMarkdownHtml(input);
			expect(result).not.toContain('javascript:');
		});

		test('removes data: URIs with scripts', () => {
			const input = '<a href="data:text/html,<script>alert(1)</script>">click</a>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).not.toContain('data:text/html');
		});

		test('removes iframe tags', () => {
			const input = '<iframe src="evil.com"></iframe><p>Text</p>';
			expect(sanitizeMarkdownHtml(input)).toBe('<p>Text</p>');
		});

		test('removes object tags', () => {
			const input = '<object data="evil.swf"></object><p>Text</p>';
			expect(sanitizeMarkdownHtml(input)).toBe('<p>Text</p>');
		});

		test('removes embed tags', () => {
			const input = '<embed src="evil.swf"><p>Text</p>';
			expect(sanitizeMarkdownHtml(input)).toBe('<p>Text</p>');
		});

		test('removes style tags', () => {
			const input = '<style>body { display: none; }</style><p>Text</p>';
			expect(sanitizeMarkdownHtml(input)).toBe('<p>Text</p>');
		});

		test('removes inline style with expression', () => {
			const input = '<p style="background: url(javascript:alert(1))">Text</p>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).not.toContain('javascript:');
		});
	});

	describe('safe content preservation', () => {
		test('preserves headings', () => {
			const input = '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>';
			expect(sanitizeMarkdownHtml(input)).toBe(input);
		});

		test('preserves paragraphs', () => {
			const input = '<p>First paragraph</p><p>Second paragraph</p>';
			expect(sanitizeMarkdownHtml(input)).toBe(input);
		});

		test('preserves text formatting', () => {
			const input = '<p><strong>Bold</strong> and <em>italic</em></p>';
			expect(sanitizeMarkdownHtml(input)).toBe(input);
		});

		test('preserves lists', () => {
			const input = '<ul><li>Item 1</li><li>Item 2</li></ul>';
			expect(sanitizeMarkdownHtml(input)).toBe(input);
		});

		test('preserves ordered lists', () => {
			const input = '<ol><li>First</li><li>Second</li></ol>';
			expect(sanitizeMarkdownHtml(input)).toBe(input);
		});

		test('preserves code blocks', () => {
			const input = '<pre><code>const x = 1;</code></pre>';
			expect(sanitizeMarkdownHtml(input)).toBe(input);
		});

		test('preserves inline code', () => {
			const input = '<p>Use <code>npm install</code> to install</p>';
			expect(sanitizeMarkdownHtml(input)).toBe(input);
		});

		test('preserves blockquotes', () => {
			const input = '<blockquote>A famous quote</blockquote>';
			expect(sanitizeMarkdownHtml(input)).toBe(input);
		});

		test('preserves line breaks and horizontal rules', () => {
			const input = '<p>Line 1<br>Line 2</p><hr>';
			expect(sanitizeMarkdownHtml(input)).toBe('<p>Line 1<br />Line 2</p><hr />');
		});

		test('preserves images with safe src', () => {
			const input = '<img src="https://example.com/image.jpg" alt="Example">';
			const result = sanitizeMarkdownHtml(input);
			expect(result).toContain('src="https://example.com/image.jpg"');
			expect(result).toContain('alt="Example"');
		});

		test('allows data: URIs for images', () => {
			const input = '<img src="data:image/png;base64,abc123" alt="Icon">';
			const result = sanitizeMarkdownHtml(input);
			expect(result).toContain('data:image/png;base64,abc123');
		});
	});

	describe('link security', () => {
		test('adds rel="noopener noreferrer" to links', () => {
			const input = '<a href="https://example.com">Link</a>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).toContain('rel="noopener noreferrer"');
		});

		test('adds target="_blank" to links', () => {
			const input = '<a href="https://example.com">Link</a>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).toContain('target="_blank"');
		});

		test('allows mailto: links', () => {
			const input = '<a href="mailto:test@example.com">Email</a>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).toContain('href="mailto:test@example.com"');
		});

		test('allows https: links', () => {
			const input = '<a href="https://example.com">Secure</a>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).toContain('href="https://example.com"');
		});

		test('allows http: links', () => {
			const input = '<a href="http://example.com">HTTP</a>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).toContain('href="http://example.com"');
		});
	});

	describe('class attribute handling', () => {
		test('preserves class attributes', () => {
			const input = '<p class="highlight">Text</p>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).toContain('class="highlight"');
		});

		test('preserves class on any allowed element', () => {
			const input = '<h1 class="title">Heading</h1>';
			const result = sanitizeMarkdownHtml(input);
			expect(result).toContain('class="title"');
		});
	});
});

describe('SANITIZE_OPTIONS configuration', () => {
	test('has allowedTags defined', () => {
		expect(SANITIZE_OPTIONS.allowedTags).toBeDefined();
		expect(SANITIZE_OPTIONS.allowedTags).toContain('p');
		expect(SANITIZE_OPTIONS.allowedTags).toContain('a');
		expect(SANITIZE_OPTIONS.allowedTags).toContain('img');
	});

	test('does not allow script in allowedTags', () => {
		expect(SANITIZE_OPTIONS.allowedTags).not.toContain('script');
		expect(SANITIZE_OPTIONS.allowedTags).not.toContain('iframe');
		expect(SANITIZE_OPTIONS.allowedTags).not.toContain('object');
	});

	test('has safe allowedSchemes', () => {
		expect(SANITIZE_OPTIONS.allowedSchemes).toContain('http');
		expect(SANITIZE_OPTIONS.allowedSchemes).toContain('https');
		expect(SANITIZE_OPTIONS.allowedSchemes).toContain('mailto');
		expect(SANITIZE_OPTIONS.allowedSchemes).not.toContain('javascript');
	});
});
