/**
 * Theme Fonts Utility
 *
 * Dynamically loads Google Fonts based on the current theme.
 * Fonts are loaded on-demand when switching themes to minimize initial load.
 */

/** Font families required for each theme */
const THEME_FONTS: Record<string, string> = {
	'modern-minimal': 'Inter:wght@400;500;600;700',
	supabase: 'Outfit:wght@400;500;600;700',
	'doom-64': 'Oxanium:wght@400;500;600;700',
	'amber-minimal': 'Inter:wght@400;500;600;700',
	'soviet-red': '' // Uses system fonts
};

/** Cache of loaded font link elements */
const loadedFonts = new Set<string>();

/**
 * Load the font for a given theme.
 *
 * Creates a stylesheet link element to load the font from Google Fonts.
 * If the font is already loaded, this is a no-op.
 *
 * @param theme - The theme name (e.g., 'modern-minimal', 'supabase')
 */
export function loadThemeFont(theme: string): void {
	const font = THEME_FONTS[theme];
	if (!font) return;

	// Skip if already loaded
	if (loadedFonts.has(font)) return;

	const linkId = `theme-font-${theme}`;
	if (document.getElementById(linkId)) {
		loadedFonts.add(font);
		return;
	}

	const link = document.createElement('link');
	link.id = linkId;
	link.rel = 'stylesheet';
	link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}&display=swap`;
	document.head.appendChild(link);

	loadedFonts.add(font);
}

/**
 * Get the font family CSS value for a theme.
 *
 * @param theme - The theme name
 * @returns CSS font-family value
 */
export function getThemeFontFamily(theme: string): string {
	switch (theme) {
		case 'modern-minimal':
		case 'amber-minimal':
			return "'Inter', system-ui, sans-serif";
		case 'supabase':
			return "'Outfit', system-ui, sans-serif";
		case 'doom-64':
			return "'Oxanium', system-ui, sans-serif";
		case 'soviet-red':
		default:
			return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
	}
}
