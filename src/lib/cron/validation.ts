export const CRON_REQUIRED_MESSAGE = 'Cron expression is required';
export const CRON_ALLOWED_CHARS_MESSAGE = 'Only digits, spaces, and * / - , are allowed';
export const CRON_FIELD_COUNT_MESSAGE = 'Cron expression must have exactly 5 fields';

export function validateCronExpression(expression: string): string {
	const trimmed = expression.trim();
	if (!trimmed) return CRON_REQUIRED_MESSAGE;
	if (!/^[\d */\-,]+$/.test(trimmed)) return CRON_ALLOWED_CHARS_MESSAGE;
	if (trimmed.split(/ +/).filter(Boolean).length !== 5) return CRON_FIELD_COUNT_MESSAGE;
	return '';
}
