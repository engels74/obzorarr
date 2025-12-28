export interface SlideMessagingContext {
	isServerWrapped: boolean;
	serverName: string | null;
}

// Returns "You", server name, or "We" based on context
export function getSubject(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'You';
	}
	return ctx.serverName ?? 'We';
}

// Returns "Your", "{Name}'s", or "Our" based on context
export function getPossessive(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'Your';
	}
	if (ctx.serverName) {
		return `${ctx.serverName}'s`;
	}
	return 'Our';
}

export function getHaveVerb(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'have';
	}
	// "We have" or "{ServerName} has"
	return ctx.serverName ? 'has' : 'have';
}

export function getAreVerb(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'are';
	}
	// "{ServerName} is" vs "We are"
	return ctx.serverName ? 'is' : 'are';
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
