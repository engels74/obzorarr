import { toast } from '$lib/services/toast';

/**
 * Form Toast Utility
 *
 * Handles SvelteKit form action responses and shows appropriate toasts.
 * Use this in $effect blocks to automatically show feedback for form submissions.
 *
 * @module utils/form-toast
 */

/** Form action response shape */
interface FormResponse {
	success?: boolean;
	error?: string;
	message?: string;
}

/**
 * Handle form action response and show appropriate toast
 *
 * @param form - The form action response (from ActionData)
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { handleFormToast } from '$lib/utils/form-toast';
 *
 *   let { form } = $props();
 *
 *   $effect(() => {
 *     handleFormToast(form);
 *   });
 * </script>
 * ```
 */
export function handleFormToast(form: FormResponse | null | undefined): void {
	if (!form) return;

	if (form.error) {
		toast.error(form.error);
	} else if (form.success) {
		toast.success(form.message ?? 'Operation completed successfully');
	}
}
