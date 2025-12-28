import { getDayOfWeekFromTimestamp, getDateStringFromTimestamp } from '../utils';
import type { PlayHistoryRecord } from '../utils';
import type {
	WeekdayDistribution,
	ContentTypeBreakdown,
	DecadeDistributionItem,
	RewatchItem,
	MarathonDay,
	WatchStreak,
	YearComparison
} from '$lib/stats/types';

export function calculateWeekdayDistribution(records: PlayHistoryRecord[]): WeekdayDistribution {
	const minutes: number[] = Array.from({ length: 7 }, () => 0);
	const plays: number[] = Array.from({ length: 7 }, () => 0);

	for (const record of records) {
		const day = getDayOfWeekFromTimestamp(record.viewedAt);
		const durationMinutes = (record.duration ?? 0) / 60;
		minutes[day] = (minutes[day] ?? 0) + durationMinutes;
		plays[day] = (plays[day] ?? 0) + 1;
	}

	return { minutes, plays };
}

export function calculateContentTypeBreakdown(records: PlayHistoryRecord[]): ContentTypeBreakdown {
	const result: ContentTypeBreakdown = {
		movies: { count: 0, minutes: 0 },
		episodes: { count: 0, minutes: 0 },
		tracks: { count: 0, minutes: 0 }
	};

	for (const record of records) {
		const durationMinutes = (record.duration ?? 0) / 60;
		const type = record.type as 'movie' | 'episode' | 'track';

		if (type === 'movie') {
			result.movies.count++;
			result.movies.minutes += durationMinutes;
		} else if (type === 'episode') {
			result.episodes.count++;
			result.episodes.minutes += durationMinutes;
		} else if (type === 'track') {
			result.tracks.count++;
			result.tracks.minutes += durationMinutes;
		}
	}

	return result;
}

export function calculateDecadeDistribution(
	records: PlayHistoryRecord[]
): DecadeDistributionItem[] {
	const decades = new Map<string, { count: number; minutes: number }>();

	for (const record of records) {
		const year = record.releaseYear;
		if (year === null || year === undefined) continue;

		const decadeStart = Math.floor(year / 10) * 10;
		const decadeLabel = `${decadeStart}s`;
		const durationMinutes = (record.duration ?? 0) / 60;

		const existing = decades.get(decadeLabel) ?? { count: 0, minutes: 0 };
		existing.count++;
		existing.minutes += durationMinutes;
		decades.set(decadeLabel, existing);
	}

	return Array.from(decades.entries())
		.map(([decade, data]) => ({
			decade,
			count: data.count,
			minutes: data.minutes
		}))
		.sort((a, b) => {
			const aYear = parseInt(a.decade);
			const bYear = parseInt(b.decade);
			return aYear - bYear;
		});
}

export function calculateTopRewatches(
	records: PlayHistoryRecord[],
	limit: number = 10
): RewatchItem[] {
	const playsByRatingKey = new Map<
		string,
		{ title: string; thumb: string | null; type: string; count: number }
	>();

	for (const record of records) {
		const existing = playsByRatingKey.get(record.ratingKey);
		if (existing) {
			existing.count++;
		} else {
			playsByRatingKey.set(record.ratingKey, {
				title: record.title,
				thumb: record.thumb,
				type: record.type,
				count: 1
			});
		}
	}

	return Array.from(playsByRatingKey.values())
		.filter((item) => item.count >= 2)
		.map((item) => ({
			title: item.title,
			thumb: item.thumb,
			type: item.type as 'movie' | 'episode' | 'track',
			rewatchCount: item.count
		}))
		.sort((a, b) => b.rewatchCount - a.rewatchCount)
		.slice(0, limit);
}

export function calculateMarathonDay(records: PlayHistoryRecord[]): MarathonDay | null {
	if (records.length === 0) return null;

	const dayStats = new Map<
		string,
		{ minutes: number; plays: number; items: { title: string; thumb: string | null }[] }
	>();

	for (const record of records) {
		const dateStr = getDateStringFromTimestamp(record.viewedAt);
		const durationMinutes = (record.duration ?? 0) / 60;

		const existing = dayStats.get(dateStr) ?? { minutes: 0, plays: 0, items: [] };
		existing.minutes += durationMinutes;
		existing.plays++;
		existing.items.push({ title: record.title, thumb: record.thumb });
		dayStats.set(dateStr, existing);
	}

	let maxDay: {
		date: string;
		stats: typeof dayStats extends Map<string, infer V> ? V : never;
	} | null = null;

	for (const [date, stats] of dayStats) {
		if (!maxDay || stats.minutes > maxDay.stats.minutes) {
			maxDay = { date, stats };
		}
	}

	if (!maxDay) return null;

	return {
		date: maxDay.date,
		minutes: maxDay.stats.minutes,
		plays: maxDay.stats.plays,
		items: maxDay.stats.items.slice(0, 10)
	};
}

export function calculateWatchStreak(records: PlayHistoryRecord[]): WatchStreak | null {
	if (records.length === 0) return null;

	const watchDates = new Set<string>();
	for (const record of records) {
		watchDates.add(getDateStringFromTimestamp(record.viewedAt));
	}

	const sortedDates = Array.from(watchDates).sort();
	if (sortedDates.length === 0) return null;

	let longestStreak = 1;
	let longestStart = sortedDates[0]!;
	let longestEnd = sortedDates[0]!;

	let currentStreak = 1;
	let currentStart = sortedDates[0]!;

	for (let i = 1; i < sortedDates.length; i++) {
		const prevDate = new Date(sortedDates[i - 1]!);
		const currDate = new Date(sortedDates[i]!);
		const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

		if (diffDays === 1) {
			currentStreak++;
		} else {
			if (currentStreak > longestStreak) {
				longestStreak = currentStreak;
				longestStart = currentStart;
				longestEnd = sortedDates[i - 1]!;
			}
			currentStreak = 1;
			currentStart = sortedDates[i]!;
		}
	}

	if (currentStreak > longestStreak) {
		longestStreak = currentStreak;
		longestStart = currentStart;
		longestEnd = sortedDates[sortedDates.length - 1]!;
	}

	return {
		longestStreak,
		startDate: longestStart,
		endDate: longestEnd
	};
}

export function calculateYearComparison(
	currentYearMinutes: number,
	previousYearMinutes: number
): YearComparison | null {
	if (previousYearMinutes === 0 && currentYearMinutes === 0) {
		return null;
	}

	const percentChange =
		previousYearMinutes === 0
			? 100
			: ((currentYearMinutes - previousYearMinutes) / previousYearMinutes) * 100;

	return {
		thisYear: currentYearMinutes,
		lastYear: previousYearMinutes,
		percentChange: Math.round(percentChange * 10) / 10
	};
}
