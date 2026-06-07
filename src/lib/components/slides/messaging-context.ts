export interface SlideMessagingContext {
	isServerWrapped: boolean;
	serverName: string | null;
}

export function getSubject(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'You';
	}
	return ctx.serverName ? `${ctx.serverName} Community` : 'We';
}

export function getPossessive(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'Your';
	}
	// Use noun-modifier form ("PARENTI Community Top Movies") to avoid
	// person-like possessive phrasing ("PARENTI's Top Movies") on server Wrapped.
	return ctx.serverName ? `${ctx.serverName} Community` : 'Our';
}

// Both personal and server-wide (community) Wrapped use plural verbs — server
// context is framed as a collective ("the {serverName} community ... watch"), not
// a single person (ISSUE-009) — so these are context-independent. The `_ctx`
// param is kept for a uniform helper API alongside getSubject/getPossessive.
export function getHaveVerb(_ctx: SlideMessagingContext): string {
	return 'have';
}

export function getAreVerb(_ctx: SlideMessagingContext): string {
	return 'are';
}

export function getWatchVerb(_ctx: SlideMessagingContext): string {
	return 'watch';
}

export function createPersonalContext(): SlideMessagingContext {
	return {
		isServerWrapped: false,
		serverName: null
	};
}

export function createServerContext(serverName: string | null): SlideMessagingContext {
	return {
		isServerWrapped: true,
		serverName
	};
}
