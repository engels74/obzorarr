import type { ParamMatcher } from '@sveltejs/kit';

/** Accepts only exactly four decimal digits, e.g. "2026". */
export const match: ParamMatcher = (param: string): boolean => /^\d{4}$/.test(param);
