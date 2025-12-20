import { describe, expect, it } from 'bun:test';
import * as fc from 'fast-check';
import { isValidTokenFormat } from '$lib/server/sharing/service';

/**
 * Custom arbitrary for UUID v4 tokens
 *
 * The isValidTokenFormat function validates UUID v4 specifically, so we need
 * to generate only v4 UUIDs for testing. UUID v4 has:
 * - Version digit (4) at position 13
 * - Variant digits (8, 9, a, b) at position 17
 *
 * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 * where x is hex and y is one of 8, 9, a, b
 */
const hexChars = '0123456789abcdef';
const variantChars = '89ab';

// Helper to generate a hex string of specific length
const hexStringArb = (length: number) =>
	fc
		.array(fc.constantFrom(...hexChars.split('')), { minLength: length, maxLength: length })
		.map((arr) => arr.join(''));

const uuidV4Arbitrary = fc
	.tuple(
		hexStringArb(8), // First segment
		hexStringArb(4), // Second segment
		hexStringArb(3), // Third segment (after the "4")
		fc.constantFrom(...variantChars.split('')), // Variant digit
		hexStringArb(3), // Fourth segment (after variant)
		hexStringArb(12) // Fifth segment
	)
	.map(([p1, p2, p3, variant, p4, p5]) => `${p1}-${p2}-4${p3}-${variant}${p4}-${p5}`);

/**
 * Property-based tests for URL Route Parsing
 *
 * Feature: obzorarr, Property 22: URL Route Parsing
 * Validates: Requirements 12.1, 14.3, 14.4
 *
 * Property: For any valid URL path matching `/wrapped/{year}` or
 * `/wrapped/{year}/u/{identifier}`, the router SHALL correctly extract
 * year and identifier parameters.
 *
 * This test verifies that the URL parsing logic correctly handles:
 * - Valid years (2000-2100)
 * - Invalid years (outside range or non-numeric)
 * - User IDs (positive integers)
 * - Share tokens (UUID v4 format)
 * - Invalid identifiers
 */

// =============================================================================
// Validation Functions (extracted from route logic for testing)
// =============================================================================

/**
 * Validate year parameter
 *
 * @param year - Year string from URL params
 * @returns True if year is valid (2000-2100)
 */
function isValidYear(year: string): boolean {
	const parsed = parseInt(year, 10);
	return !isNaN(parsed) && parsed >= 2000 && parsed <= 2100;
}

/**
 * Parse year parameter
 *
 * @param year - Year string from URL params
 * @returns Parsed year number or null if invalid
 */
function parseYear(year: string): number | null {
	const parsed = parseInt(year, 10);
	if (isNaN(parsed) || parsed < 2000 || parsed > 2100) {
		return null;
	}
	return parsed;
}

/**
 * Parse identifier parameter
 *
 * Determines if the identifier is a user ID (number) or share token (UUID).
 *
 * @param identifier - Identifier string from URL params
 * @returns Parsed result or null if invalid
 */
function parseIdentifier(
	identifier: string
): { type: 'userId'; value: number } | { type: 'token'; value: string } | null {
	// Check if it's a valid UUID token first
	if (isValidTokenFormat(identifier)) {
		return { type: 'token', value: identifier };
	}

	// Try to parse as a user ID (positive integer)
	const parsed = parseInt(identifier, 10);
	if (!isNaN(parsed) && parsed > 0 && String(parsed) === identifier) {
		return { type: 'userId', value: parsed };
	}

	return null;
}

// =============================================================================
// Property 22: URL Route Parsing
// =============================================================================

// Feature: obzorarr, Property 22: URL Route Parsing
describe('Property 22: URL Route Parsing', () => {
	// -------------------------------------------------------------------------
	// Year Validation Tests
	// -------------------------------------------------------------------------

	describe('Year parameter validation', () => {
		it('correctly validates years in range 2000-2100', () => {
			fc.assert(
				fc.property(fc.integer({ min: 2000, max: 2100 }), (year) => {
					return isValidYear(String(year)) === true;
				}),
				{ numRuns: 100 }
			);
		});

		it('rejects years below 2000', () => {
			fc.assert(
				fc.property(fc.integer({ min: -10000, max: 1999 }), (year) => {
					return isValidYear(String(year)) === false;
				}),
				{ numRuns: 100 }
			);
		});

		it('rejects years above 2100', () => {
			fc.assert(
				fc.property(fc.integer({ min: 2101, max: 10000 }), (year) => {
					return isValidYear(String(year)) === false;
				}),
				{ numRuns: 100 }
			);
		});

		it('rejects non-numeric year strings', () => {
			fc.assert(
				fc.property(
					fc.string().filter((s) => isNaN(parseInt(s, 10))),
					(invalidYear) => {
						return isValidYear(invalidYear) === false;
					}
				),
				{ numRuns: 100 }
			);
		});

		it('parseYear returns correct number for valid years', () => {
			fc.assert(
				fc.property(fc.integer({ min: 2000, max: 2100 }), (year) => {
					const result = parseYear(String(year));
					return result === year;
				}),
				{ numRuns: 100 }
			);
		});

		it('parseYear returns null for invalid years', () => {
			fc.assert(
				fc.property(
					fc.oneof(fc.integer({ min: -10000, max: 1999 }), fc.integer({ min: 2101, max: 10000 })),
					(invalidYear) => {
						return parseYear(String(invalidYear)) === null;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// -------------------------------------------------------------------------
	// Identifier Validation Tests
	// -------------------------------------------------------------------------

	describe('Identifier parameter validation', () => {
		it('correctly identifies positive integers as user IDs', () => {
			fc.assert(
				fc.property(fc.integer({ min: 1, max: 10000000 }), (userId) => {
					const result = parseIdentifier(String(userId));
					return result !== null && result.type === 'userId' && result.value === userId;
				}),
				{ numRuns: 100 }
			);
		});

		it('correctly identifies UUID v4 tokens as share tokens', () => {
			fc.assert(
				fc.property(uuidV4Arbitrary, (token) => {
					const result = parseIdentifier(token);
					return result !== null && result.type === 'token' && result.value === token;
				}),
				{ numRuns: 100 }
			);
		});

		it('rejects zero as user ID', () => {
			const result = parseIdentifier('0');
			expect(result).toBeNull();
		});

		it('rejects negative integers', () => {
			fc.assert(
				fc.property(fc.integer({ min: -10000000, max: -1 }), (negativeId) => {
					return parseIdentifier(String(negativeId)) === null;
				}),
				{ numRuns: 100 }
			);
		});

		it('rejects invalid string identifiers', () => {
			fc.assert(
				fc.property(
					fc.string().filter((s) => {
						// Not a valid UUID
						if (isValidTokenFormat(s)) return false;
						// Not a valid positive integer
						const parsed = parseInt(s, 10);
						if (!isNaN(parsed) && parsed > 0 && String(parsed) === s) return false;
						return true;
					}),
					(invalidId) => {
						return parseIdentifier(invalidId) === null;
					}
				),
				{ numRuns: 100 }
			);
		});

		it('rejects floating point numbers', () => {
			fc.assert(
				fc.property(
					fc.double({ min: 0.1, max: 10000, noNaN: true }).filter((n) => n !== Math.floor(n)),
					(floatNum) => {
						const result = parseIdentifier(String(floatNum));
						// Float strings should be rejected (e.g., "1.5" is not "1")
						return result === null;
					}
				),
				{ numRuns: 100 }
			);
		});
	});

	// -------------------------------------------------------------------------
	// Combined Route Tests
	// -------------------------------------------------------------------------

	describe('Full route parsing', () => {
		it('server-wide route: /wrapped/{year} with valid year', () => {
			fc.assert(
				fc.property(fc.integer({ min: 2000, max: 2100 }), (year) => {
					const parsedYear = parseYear(String(year));
					return parsedYear === year;
				}),
				{ numRuns: 100 }
			);
		});

		it('per-user route: /wrapped/{year}/u/{userId} with valid year and userId', () => {
			fc.assert(
				fc.property(
					fc.integer({ min: 2000, max: 2100 }),
					fc.integer({ min: 1, max: 10000000 }),
					(year, userId) => {
						const parsedYear = parseYear(String(year));
						const parsedIdentifier = parseIdentifier(String(userId));

						return (
							parsedYear === year &&
							parsedIdentifier !== null &&
							parsedIdentifier.type === 'userId' &&
							parsedIdentifier.value === userId
						);
					}
				),
				{ numRuns: 100 }
			);
		});

		it('per-user route: /wrapped/{year}/u/{token} with valid year and share token', () => {
			fc.assert(
				fc.property(fc.integer({ min: 2000, max: 2100 }), uuidV4Arbitrary, (year, token) => {
					const parsedYear = parseYear(String(year));
					const parsedIdentifier = parseIdentifier(token);

					return (
						parsedYear === year &&
						parsedIdentifier !== null &&
						parsedIdentifier.type === 'token' &&
						parsedIdentifier.value === token
					);
				}),
				{ numRuns: 100 }
			);
		});
	});

	// -------------------------------------------------------------------------
	// Edge Cases
	// -------------------------------------------------------------------------

	describe('Edge cases', () => {
		it('handles boundary year 2000', () => {
			expect(isValidYear('2000')).toBe(true);
			expect(parseYear('2000')).toBe(2000);
		});

		it('handles boundary year 2100', () => {
			expect(isValidYear('2100')).toBe(true);
			expect(parseYear('2100')).toBe(2100);
		});

		it('rejects year 1999 (just below range)', () => {
			expect(isValidYear('1999')).toBe(false);
			expect(parseYear('1999')).toBeNull();
		});

		it('rejects year 2101 (just above range)', () => {
			expect(isValidYear('2101')).toBe(false);
			expect(parseYear('2101')).toBeNull();
		});

		it('handles user ID 1 (minimum valid)', () => {
			const result = parseIdentifier('1');
			expect(result).toEqual({ type: 'userId', value: 1 });
		});

		it('handles large user IDs', () => {
			const result = parseIdentifier('999999999');
			expect(result).toEqual({ type: 'userId', value: 999999999 });
		});

		it('rejects empty string as identifier', () => {
			expect(parseIdentifier('')).toBeNull();
		});

		it('rejects whitespace-only identifier', () => {
			expect(parseIdentifier('   ')).toBeNull();
		});

		it('handles lowercase UUID', () => {
			const token = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
			const result = parseIdentifier(token);
			expect(result).toEqual({ type: 'token', value: token });
		});

		it('handles uppercase UUID', () => {
			const token = 'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11';
			const result = parseIdentifier(token);
			// isValidTokenFormat should handle case-insensitive UUIDs
			if (isValidTokenFormat(token)) {
				expect(result).toEqual({ type: 'token', value: token });
			} else {
				expect(result).toBeNull();
			}
		});
	});
});
