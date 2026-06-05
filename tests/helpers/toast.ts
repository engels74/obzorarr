export type TestToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface TestToastCall {
	variant: TestToastVariant;
	message: string;
	options?: unknown;
}

const testToastCalls: TestToastCall[] = [];

function recordToast(variant: TestToastVariant, message: string, options?: unknown): void {
	testToastCalls.push({ variant, message, options });
}

export function getTestToastCalls(): TestToastCall[] {
	return [...testToastCalls];
}

export function clearTestToastCalls(): void {
	testToastCalls.length = 0;
}

export const testToast = {
	success(message: string, options?: unknown) {
		recordToast('success', message, options);
	},
	error(message: string, options?: unknown) {
		recordToast('error', message, options);
	},
	warning(message: string, options?: unknown) {
		recordToast('warning', message, options);
	},
	info(message: string, options?: unknown) {
		recordToast('info', message, options);
	},
	dismiss() {
		// no-op in tests
	}
};
