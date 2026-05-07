import { describe, expect, it } from 'bun:test';
import {
	CredentialedUrlError,
	normalizeOpenAIBaseUrl,
	normalizePlexServerUrl
} from '$lib/server/security/credentialed-url';

describe('credentialed URL policy', () => {
	it('accepts HTTPS Plex and OpenAI URLs', () => {
		expect(
			normalizePlexServerUrl(' https://plex.example.com:32400/ ', {
				allowInsecureLocalHttp: false
			})
		).toBe('https://plex.example.com:32400');
		expect(normalizeOpenAIBaseUrl('https://api.example.com/v1/')).toBe(
			'https://api.example.com/v1'
		);
	});

	it('rejects OpenAI HTTP URLs', () => {
		expect(() => normalizeOpenAIBaseUrl('http://api.example.com/v1')).toThrow(
			'OpenAI base URL must use HTTPS.'
		);
	});

	it('rejects public HTTP Plex URLs even with opt-in', () => {
		expect(() =>
			normalizePlexServerUrl('http://plex.example.com:32400', {
				allowInsecureLocalHttp: true
			})
		).toThrow(CredentialedUrlError);
	});

	it('requires opt-in for local/private HTTP Plex URLs', () => {
		expect(() =>
			normalizePlexServerUrl('http://192.168.1.10:32400', {
				allowInsecureLocalHttp: false
			})
		).toThrow('HTTP Plex URLs require a local/private host and explicit local HTTP opt-in.');

		expect(
			normalizePlexServerUrl('http://192.168.1.10:32400/', {
				allowInsecureLocalHttp: true
			})
		).toBe('http://192.168.1.10:32400');
	});

	it('rejects credentials, query strings, and fragments in base URLs', () => {
		expect(() => normalizeOpenAIBaseUrl('https://user:pass@example.com/v1')).toThrow();
		expect(() => normalizeOpenAIBaseUrl('https://example.com/v1?x=1')).toThrow();
		expect(() => normalizeOpenAIBaseUrl('https://example.com/v1#frag')).toThrow();
	});
});
