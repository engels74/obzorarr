/**
 * Per-theme font triples (display / body / mono). Display fonts are used for
 * headings + hero typography on /wrapped surfaces; body fonts cover the rest
 * of the UI. Mono fonts are reserved for log viewers / API config blobs.
 *
 * Each entry is a Google Fonts `family=...` spec consumed by `loadThemeFonts`
 * to inject a single `<link>` per theme. Themes whose triple includes only
 * system fonts produce no `<link>` at all.
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
 * Load the Google Fonts stylesheet(s) for a theme.
 *
 * Each theme's `<link>` is appended at most once per page lifetime; calling
 * this with the same theme name twice is a no-op. Pure-system-font themes
 * (`soviet-red`) inject nothing.
 *
 * Renamed from `loadThemeFont` (singular) in the v3 UI overhaul to reflect
 * the per-theme display/body/mono triple model.
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

/**
 * Return the CSS `font-family` stack for a theme's body text. Useful when
 * setting `font-family` outside the `--font-sans` custom property path.
 */
export function getThemeFontFamily(theme: string): string {
	return THEME_FAMILIES[theme]?.body ?? DEFAULT_TRIPLE.body;
}

/**
 * Return the full `{ display, body, mono }` triple for a theme.
 */
export function getThemeFontTriple(theme: string): FontTriple {
	return THEME_FAMILIES[theme] ?? DEFAULT_TRIPLE;
}
