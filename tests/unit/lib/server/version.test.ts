import { afterEach, describe, expect, it } from 'bun:test';
import { env } from '$env/dynamic/private';
import { getAppVersion } from '$lib/server/version';
import pkg from '../../../../package.json';

const envAny = env as Record<string, string | undefined>;

afterEach(() => {
	delete envAny.COMMIT_TAG;
});

describe('getAppVersion', () => {
	it.each([
		[undefined, { kind: 'dev', display: `v${pkg.version}` }],
		['0.1.10', { kind: 'release', display: 'v0.1.10' }],
		['v1.2.3', { kind: 'release', display: 'v1.2.3' }],
		['c465277744366334c082ae4105e5c53d4a12b9b7', { kind: 'nightly', display: 'nightly · c465277' }],
		['abcdef0', { kind: 'nightly', display: 'nightly · abcdef0' }],
		['weird-tag-name', { kind: 'dev', display: 'weird-tag-name' }],
		['  0.1.10  ', { kind: 'release', display: 'v0.1.10' }],
		['0.1.10-beta', { kind: 'dev', display: '0.1.10-beta' }],
		['v1.2.3foo', { kind: 'dev', display: 'v1.2.3foo' }]
	] as const)('classifies COMMIT_TAG=%p', (tag, expected) => {
		if (tag === undefined) delete envAny.COMMIT_TAG;
		else envAny.COMMIT_TAG = tag;

		expect(getAppVersion()).toEqual(expected);
	});
});
