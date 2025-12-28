import { toast } from '$lib/services/toast';

interface FormResponse {
	success?: boolean;
	error?: string;
	message?: string;
}

export function handleFormToast(form: FormResponse | null | undefined): void {
	if (!form) return;

	if (form.error) {
		toast.error(form.error);
	} else if (form.success) {
		toast.success(form.message ?? 'Operation completed successfully');
	}
}
