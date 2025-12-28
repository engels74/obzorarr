const THEME_FONTS: Record<string, string> = {
	'modern-minimal': 'Inter:wght@400;500;600;700',
	supabase: 'Outfit:wght@400;500;600;700',
	'doom-64': 'Oxanium:wght@400;500;600;700',
	'amber-minimal': 'Inter:wght@400;500;600;700',
	'soviet-red': '', // Uses system fonts
	// Premium wrapped themes
	'obsidian-premium': 'Inter:wght@400;500;600;700;800',
	'aurora-premium': 'Outfit:wght@400;500;600;700;800',
	'champagne-premium': 'Inter:wght@400;500;600;700;800'
};

const loadedFonts = new Set<string>();

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

export function getThemeFontFamily(theme: string): string {
	switch (theme) {
		case 'modern-minimal':
		case 'amber-minimal':
		case 'obsidian-premium':
		case 'champagne-premium':
			return "'Inter', system-ui, sans-serif";
		case 'supabase':
		case 'aurora-premium':
			return "'Outfit', system-ui, sans-serif";
		case 'doom-64':
			return "'Oxanium', system-ui, sans-serif";
		case 'soviet-red':
		default:
			return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
	}
}
