export const CRON_REQUIRED_MESSAGE = 'Cron expression is required';
export const CRON_ALLOWED_CHARS_MESSAGE = 'Only digits, spaces, and * / - , are allowed';
export const CRON_FIELD_COUNT_MESSAGE = 'Cron expression must have exactly 5 fields';
export const CRON_RANGE_MESSAGE = 'Cron expression contains an out-of-range value';

// [min, max] for each of the 5 cron fields (minute, hour, dom, month, dow)
const FIELD_RANGES: [number, number][] = [
	[0, 59],
	[0, 23],
	[1, 31],
	[1, 12],
	[0, 7]
];

/**
 * Returns true when every atomic numeric token in the cron field token falls
 * within [min, max]. Handles *, step (/), range (-), and list (,).
 */
function isFieldInRange(token: string, min: number, max: number): boolean {
	if (token === '*') return true;

	if (token.includes('/')) {
		const parts = token.split('/');
		// Exactly one "/" — reject tokens like "*/5/2"
		if (parts.length !== 2) return false;
		const [base, step] = parts;
		const stepNum = Number(step);
		if (!step || !Number.isInteger(stepNum) || stepNum < 1) return false;
		// Base must be present (reject "/5") — can be "*", a plain number, or a range
		if (!base) return false;
		if (base !== '*' && !isFieldInRange(base, min, max)) return false;
		return true;
	}

	if (token.includes(',')) {
		return token.split(',').every((part) => isFieldInRange(part, min, max));
	}

	if (token.includes('-')) {
		const parts = token.split('-');
		// Exactly two non-empty segments — reject "-1", "1-", "1-5-2"
		if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
		const [lo, hi] = parts.map(Number);
		return (
			lo !== undefined &&
			hi !== undefined &&
			Number.isInteger(lo) &&
			Number.isInteger(hi) &&
			lo >= min &&
			hi <= max &&
			lo <= hi
		);
	}

	// Plain integer — reject empty token (Number('') === 0 would falsely pass for min=0 fields)
	if (!token) return false;
	const num = Number(token);
	return Number.isInteger(num) && num >= min && num <= max;
}

export function validateCronExpression(expression: string): string {
	const trimmed = expression.trim();
	if (!trimmed) return CRON_REQUIRED_MESSAGE;
	if (!/^[\d */\-,]+$/.test(trimmed)) return CRON_ALLOWED_CHARS_MESSAGE;
	const fields = trimmed.split(/ +/).filter(Boolean);
	if (fields.length !== 5) return CRON_FIELD_COUNT_MESSAGE;
	for (let i = 0; i < 5; i++) {
		const range = FIELD_RANGES[i];
		const field = fields[i];
		if (!range || field === undefined) return CRON_RANGE_MESSAGE;
		const [min, max] = range;
		if (!isFieldInRange(field, min, max)) return CRON_RANGE_MESSAGE;
	}
	return '';
}
