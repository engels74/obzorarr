/**
 * Themes deliberately carry separate display/body/mono stacks so Wrapped
 * surfaces can use expressive headings without changing log/API monospace copy.
 */
type FontTriple = {
	display: string;
	body: string;
	mono: string;
};

const THEME_FONT_SPECS: Record<string, string[]> = {
	'modern-minimal': ['Inter:wght@400;500;600;700;800'],
	supabase: ['Outfit:wght@400;500;600;700;800'],
	'doom-64': ['Oxanium:wght@400;500;600;700;800'],
	'amber-minimal': ['Inter:wght@400;500;600;700;800'],
	'soviet-red': [],
	'obsidian-premium': ['Inter:wght@400;500;600;700;800;900'],
	'aurora-premium': ['Outfit:wght@400;500;600;700;800;900'],
	'champagne-premium': ['Inter:wght@400;500;600;700;800;900']
};

const DEFAULT_TRIPLE: FontTriple = {
	display: "'Inter', system-ui, sans-serif",
	body: "'Inter', system-ui, sans-serif",
	mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
};

const THEME_FAMILIES: Record<string, FontTriple> = {
	'modern-minimal': {
		display: "'Inter', system-ui, sans-serif",
		body: "'Inter', system-ui, sans-serif",
		mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
	},
	supabase: {
		display: "'Outfit', system-ui, sans-serif",
		body: "'Outfit', system-ui, sans-serif",
		mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
	},
	'doom-64': {
		display: "'Oxanium', system-ui, sans-serif",
		body: "'Oxanium', system-ui, sans-serif",
		mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
	},
	'amber-minimal': {
		display: "'Inter', system-ui, sans-serif",
		body: "'Inter', system-ui, sans-serif",
		mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
	},
	'soviet-red': {
		display: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		body: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
	},
	'obsidian-premium': {
		display: "'Inter', system-ui, sans-serif",
		body: "'Inter', system-ui, sans-serif",
		mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
	},
	'aurora-premium': {
		display: "'Outfit', system-ui, sans-serif",
		body: "'Outfit', system-ui, sans-serif",
		mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
	},
	'champagne-premium': {
		display: "'Inter', system-ui, sans-serif",
		body: "'Inter', system-ui, sans-serif",
		mono: 'ui-monospace, SFMono-Regular, Menlo, monospace'
	}
};

const loadedThemes = new Set<string>();

/**
 * Font loading is idempotent per page lifetime so repeated theme switches do
 * not accumulate duplicate Google Fonts links. Pure-system-font themes inject
 * nothing.
 */
export function loadThemeFonts(theme: string): void {
	const specs = THEME_FONT_SPECS[theme];
	if (!specs || specs.length === 0) return;
	if (loadedThemes.has(theme)) return;

	const linkId = `theme-fonts-${theme}`;
	if (document.getElementById(linkId)) {
		loadedThemes.add(theme);
		return;
	}

	const families = specs.map((s) => `family=${encodeURIComponent(s)}`).join('&');
	const link = document.createElement('link');
	link.id = linkId;
	link.rel = 'stylesheet';
	link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
	document.head.appendChild(link);

	loadedThemes.add(theme);
}

export function getThemeFontFamily(theme: string): string {
	return THEME_FAMILIES[theme]?.body ?? DEFAULT_TRIPLE.body;
}

export function getThemeFontTriple(theme: string): FontTriple {
	return THEME_FAMILIES[theme] ?? DEFAULT_TRIPLE;
}
