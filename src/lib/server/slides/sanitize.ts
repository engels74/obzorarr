import sanitizeHtml from 'sanitize-html';

export const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: [
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'p',
		'br',
		'hr',
		'ul',
		'ol',
		'li',
		'strong',
		'b',
		'em',
		'i',
		'code',
		'pre',
		'blockquote',
		'a',
		'img'
	],
	allowedAttributes: {
		a: ['href', 'title', 'target', 'rel'],
		img: ['src', 'alt', 'title', 'width', 'height'],
		'*': ['class']
	},
	allowedSchemes: ['http', 'https', 'mailto'],
	allowedSchemesByTag: {
		img: ['http', 'https', 'data']
	},
	transformTags: {
		a: (tagName, attribs) => ({
			tagName,
			attribs: {
				...attribs,
				rel: 'noopener noreferrer',
				target: '_blank'
			}
		})
	}
};

export function sanitizeMarkdownHtml(html: string): string {
	return sanitizeHtml(html, SANITIZE_OPTIONS);
}
