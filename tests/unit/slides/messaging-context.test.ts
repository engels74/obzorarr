/**
 * Unit tests for slide messaging-context helpers
 *
 * Covers verb-agreement helpers: getHaveVerb, getAreVerb, getWatchVerb,
 * as well as getSubject, getPossessive, and the context factory functions.
 */

import { describe, expect, it } from 'bun:test';
import {
	createPersonalContext,
	createServerContext,
	getAreVerb,
	getHaveVerb,
	getPossessive,
	getSubject,
	getWatchVerb
} from '$lib/components/slides/messaging-context';

describe('createPersonalContext', () => {
	it('creates a non-server-wrapped context', () => {
		const ctx = createPersonalContext();
		expect(ctx.isServerWrapped).toBe(false);
		expect(ctx.serverName).toBeNull();
	});
});

describe('createServerContext', () => {
	it('creates a server-wrapped context with a name', () => {
		const ctx = createServerContext('PARENTI');
		expect(ctx.isServerWrapped).toBe(true);
		expect(ctx.serverName).toBe('PARENTI');
	});

	it('creates a server-wrapped context with null name', () => {
		const ctx = createServerContext(null);
		expect(ctx.isServerWrapped).toBe(true);
		expect(ctx.serverName).toBeNull();
	});
});

describe('getSubject', () => {
	it('returns "You" for personal context', () => {
		expect(getSubject(createPersonalContext())).toBe('You');
	});

	it('returns server name for named server context', () => {
		expect(getSubject(createServerContext('PARENTI'))).toBe('PARENTI');
	});

	it('returns "We" for unnamed server context', () => {
		expect(getSubject(createServerContext(null))).toBe('We');
	});
});

describe('getPossessive', () => {
	it('returns "Your" for personal context', () => {
		expect(getPossessive(createPersonalContext())).toBe('Your');
	});

	it('returns possessive of server name for named server context', () => {
		expect(getPossessive(createServerContext('PARENTI'))).toBe("PARENTI's");
	});

	it('returns "Our" for unnamed server context', () => {
		expect(getPossessive(createServerContext(null))).toBe('Our');
	});
});

describe('getHaveVerb', () => {
	it('returns "have" for personal context', () => {
		expect(getHaveVerb(createPersonalContext())).toBe('have');
	});

	it('returns "has" for named server context (singular proper noun)', () => {
		expect(getHaveVerb(createServerContext('PARENTI'))).toBe('has');
	});

	it('returns "have" for unnamed server context (plural fallback)', () => {
		expect(getHaveVerb(createServerContext(null))).toBe('have');
	});
});

describe('getAreVerb', () => {
	it('returns "are" for personal context', () => {
		expect(getAreVerb(createPersonalContext())).toBe('are');
	});

	it('returns "is" for named server context (singular proper noun)', () => {
		expect(getAreVerb(createServerContext('PARENTI'))).toBe('is');
	});

	it('returns "are" for unnamed server context (plural fallback)', () => {
		expect(getAreVerb(createServerContext(null))).toBe('are');
	});
});

describe('getWatchVerb', () => {
	it('returns "watch" for personal context', () => {
		expect(getWatchVerb(createPersonalContext())).toBe('watch');
	});

	it('returns "watches" for named server context (singular proper noun)', () => {
		expect(getWatchVerb(createServerContext('PARENTI'))).toBe('watches');
	});

	it('returns "watch" for unnamed server context (plural fallback)', () => {
		expect(getWatchVerb(createServerContext(null))).toBe('watch');
	});

	it('produces grammatically correct heading for server name', () => {
		const ctx = createServerContext('PARENTI');
		const heading = `When ${getSubject(ctx)} ${getWatchVerb(ctx)}`;
		expect(heading).toBe('When PARENTI watches');
	});

	it('produces grammatically correct heading for personal context', () => {
		const ctx = createPersonalContext();
		const heading = `When ${getSubject(ctx)} ${getWatchVerb(ctx)}`;
		expect(heading).toBe('When You watch');
	});
});
