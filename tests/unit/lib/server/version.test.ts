import { afterEach, describe, expect, it } from 'bun:test';
import { env } from '$env/dynamic/private';
import { getAppVersion } from '$lib/server/version';
import pkg from '../../../../package.json';

const envAny = env as Record<string, string | undefined>;

afterEach(() => {
	delete envAny.COMMIT_TAG;
});

describe('getAppVersion', () => {
	it('returns kind=dev with package.json version when COMMIT_TAG is unset', () => {
		delete envAny.COMMIT_TAG;
		expect(getAppVersion()).toEqual({ kind: 'dev', display: `v${pkg.version}` });
	});

	it('classifies a bare semver COMMIT_TAG as release and prefixes v', () => {
		envAny.COMMIT_TAG = '0.1.10';
		expect(getAppVersion()).toEqual({ kind: 'release', display: 'v0.1.10' });
	});

	it('preserves an existing v prefix on release tags', () => {
		envAny.COMMIT_TAG = 'v1.2.3';
		expect(getAppVersion()).toEqual({ kind: 'release', display: 'v1.2.3' });
	});

	it('classifies a 40-char sha as nightly and truncates to 7 chars', () => {
		envAny.COMMIT_TAG = 'c465277744366334c082ae4105e5c53d4a12b9b7';
		expect(getAppVersion()).toEqual({ kind: 'nightly', display: 'nightly · c465277' });
	});

	it('accepts a short sha (7 chars) as nightly', () => {
		envAny.COMMIT_TAG = 'abcdef0';
		expect(getAppVersion()).toEqual({ kind: 'nightly', display: 'nightly · abcdef0' });
	});

	it('falls back to kind=dev passing through unrecognised tag formats', () => {
		envAny.COMMIT_TAG = 'weird-tag-name';
		expect(getAppVersion()).toEqual({ kind: 'dev', display: 'weird-tag-name' });
	});

	it('trims surrounding whitespace from COMMIT_TAG', () => {
		envAny.COMMIT_TAG = '  0.1.10  ';
		expect(getAppVersion()).toEqual({ kind: 'release', display: 'v0.1.10' });
	});
});
