/**
 * Unit tests for Plex Thumbnail URL Utility
 *
 * Tests the getThumbUrl function that transforms Plex thumbnail paths
 * to proxied URLs.
 */

import { describe, expect, it } from 'bun:test';
import { getThumbUrl } from '$lib/utils/plex-thumb';

describe('getThumbUrl', () => {
	describe('null/undefined handling', () => {
		it('returns null for null input', () => {
			expect(getThumbUrl(null)).toBeNull();
		});

		it('returns null for undefined input', () => {
			expect(getThumbUrl(undefined)).toBeNull();
		});

		it('returns null for empty string', () => {
			expect(getThumbUrl('')).toBeNull();
		});
	});

	describe('Plex relative path transformation', () => {
		it('transforms standard library metadata thumb path', () => {
			const input = '/library/metadata/70612/thumb/1765677730';
			const expected = '/plex/thumb/library/metadata/70612/thumb/1765677730';
			expect(getThumbUrl(input)).toBe(expected);
		});

		it('transforms path with different ratingKey', () => {
			const input = '/library/metadata/12345/thumb/9876543210';
			const expected = '/plex/thumb/library/metadata/12345/thumb/9876543210';
			expect(getThumbUrl(input)).toBe(expected);
		});

		it('transforms path with large numbers', () => {
			const input = '/library/metadata/999999999/thumb/1234567890123';
			const expected = '/plex/thumb/library/metadata/999999999/thumb/1234567890123';
			expect(getThumbUrl(input)).toBe(expected);
		});

		it('transforms any path starting with /', () => {
			const input = '/some/other/path';
			const expected = '/plex/thumb/some/other/path';
			expect(getThumbUrl(input)).toBe(expected);
		});
	});

	describe('already proxied URL handling', () => {
		it('returns already proxied URL as-is', () => {
			const input = '/plex/thumb/library/metadata/70612/thumb/1765677730';
			expect(getThumbUrl(input)).toBe(input);
		});

		it('does not double-proxy URLs', () => {
			const proxied = '/plex/thumb/library/metadata/123/thumb/456';
			expect(getThumbUrl(proxied)).toBe(proxied);
		});
	});

	describe('external URL handling', () => {
		it('returns https URLs as-is', () => {
			const input = 'https://image.tmdb.org/t/p/w500/poster.jpg';
			expect(getThumbUrl(input)).toBe(input);
		});

		it('returns http URLs as-is', () => {
			const input = 'http://example.com/image.jpg';
			expect(getThumbUrl(input)).toBe(input);
		});

		it('handles https URLs with ports', () => {
			const input = 'https://example.com:8080/image.jpg';
			expect(getThumbUrl(input)).toBe(input);
		});

		it('handles https URLs with query params', () => {
			const input = 'https://example.com/image.jpg?size=large&format=webp';
			expect(getThumbUrl(input)).toBe(input);
		});
	});

	describe('edge cases', () => {
		it('handles path with just a slash', () => {
			const input = '/';
			const expected = '/plex/thumb/';
			expect(getThumbUrl(input)).toBe(expected);
		});

		it('handles path without leading slash (returns as-is)', () => {
			const input = 'library/metadata/123/thumb/456';
			expect(getThumbUrl(input)).toBe(input);
		});

		it('handles whitespace-only string as falsy', () => {
			// Note: '   ' is truthy in JS but doesn't start with / or http
			const input = '   ';
			expect(getThumbUrl(input)).toBe(input);
		});
	});
});
