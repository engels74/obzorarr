import type { ActionResult } from '@sveltejs/kit';
import { toast } from '$lib/services/toast';

/**
 * Legacy form-action response shape — produced by routes that still build
 * `{ success, error, warning, message }` objects in their action handlers.
 * The Superforms migration removes this shape; the legacy branch is dropped
 * in PR-4 / D1 (see LEGACY_REMOVAL.md).
 */
interface LegacyFormResponse {
	success?: boolean;
	error?: string;
	warning?: boolean;
	message?: string;
}

type FormShape = LegacyFormResponse | ActionResult | null | undefined;

function isLegacyResponse(value: object): value is LegacyFormResponse {
	return (
		'success' in value ||
		'error' in value ||
		'warning' in value ||
		('message' in value && !('type' in value))
	);
}

/**
 * Toast a form-action result. Accepts both the legacy `FormResponse` shape
 * (kept compatible during the Superforms incremental migration across
 * PR-2/3) and the Superforms-native `ActionResult` shape returned by
 * `use:enhance`. The legacy branch is removed in PR-4 / D1.
 */
export function handleFormToast(form: FormShape): void {
	if (!form || typeof form !== 'object') return;

	// Superforms ActionResult: discriminated by `type`.
	if ('type' in form && typeof form.type === 'string') {
		switch (form.type) {
			case 'success': {
				const data = (form as Extract<ActionResult, { type: 'success' }>).data as
					| { message?: string }
					| undefined;
				toast.success(data?.message ?? 'Operation completed successfully');
				return;
			}
			case 'failure': {
				const data = (form as Extract<ActionResult, { type: 'failure' }>).data as
					| { error?: string; message?: string }
					| undefined;
				toast.error(data?.error ?? data?.message ?? 'An unexpected error occurred');
				return;
			}
			case 'error': {
				const err = (form as Extract<ActionResult, { type: 'error' }>).error as
					| { message?: string }
					| undefined;
				toast.error(err?.message ?? 'An unexpected error occurred');
				return;
			}
			case 'redirect':
				// Redirects are surfaced by SvelteKit's navigation — no toast.
				return;
		}
	}

	// Legacy `FormResponse` shape.
	if (isLegacyResponse(form)) {
		if (form.error) {
			toast.error(form.error);
			return;
		}
		if (form.warning) {
			toast.warning(form.message ?? 'Please review the warning');
			return;
		}
		if (form.success) {
			toast.success(form.message ?? 'Operation completed successfully');
		}
	}
}
