import { countPlayHistory } from '$lib/server/admin/settings.service';
import { getAvailableYears } from '$lib/server/admin/users.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [availableYears, playHistoryTotalCount] = await Promise.all([
		getAvailableYears(),
		countPlayHistory()
	]);

	return {
		availableYears,
		currentYear: new Date().getFullYear(),
		playHistoryTotalCount
	};
};
