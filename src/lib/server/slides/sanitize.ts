import sanitizeHtml from 'sanitize-html';

const ALLOWED_IMAGE_MIME_TYPES = /^image\/(png|jpe?g|gif|webp)$/i;

function isValidImageDataUri(src: string): boolean {
	if (!src.startsWith('data:')) return true;
	const mimeType = src.slice(5).split(/[,;]/)[0];
	if (!mimeType) return false;
	return ALLOWED_IMAGE_MIME_TYPES.test(mimeType);
}

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
		}),
		img: (tagName, attribs) => {
			if (attribs.src && !isValidImageDataUri(attribs.src)) {
				const { src: _, ...safeAttribs } = attribs;
				return { tagName, attribs: safeAttribs };
			}
			return { tagName, attribs };
		}
	}
};

export function sanitizeMarkdownHtml(html: string): string {
	return sanitizeHtml(html, SANITIZE_OPTIONS);
}
