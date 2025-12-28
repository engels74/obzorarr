export interface SlideMessagingContext {
	isServerWrapped: boolean;
	serverName: string | null;
}

export function getSubject(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'You';
	}
	return ctx.serverName ?? 'We';
}

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
	return ctx.serverName ? 'has' : 'have';
}

export function getAreVerb(ctx: SlideMessagingContext): string {
	if (!ctx.isServerWrapped) {
		return 'are';
	}
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
