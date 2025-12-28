import type { Snippet } from 'svelte';
import type {
	RankedItem,
	BingeSession,
	WatchRecord,
	MonthlyDistribution,
	HourlyDistribution
} from '$lib/server/stats/types';

export type SlideType =
	| 'total-time'
	| 'top-movies'
	| 'top-shows'
	| 'genres'
	| 'distribution'
	| 'percentile'
	| 'binge'
	| 'first-last'
	| 'custom';

export const DEFAULT_SLIDE_ORDER: readonly SlideType[] = [
	'total-time',
	'top-movies',
	'top-shows',
	'genres',
	'distribution',
	'percentile',
	'binge',
	'first-last'
] as const;

export interface BaseSlideProps {
	active?: boolean;
	onAnimationComplete?: () => void;
	class?: string;
	children?: Snippet;
}

export interface TotalTimeSlideProps extends BaseSlideProps {
	totalWatchTimeMinutes: number;
}

export interface TopMoviesSlideProps extends BaseSlideProps {
	topMovies: RankedItem[];
	limit?: number;
}

export interface TopShowsSlideProps extends BaseSlideProps {
	topShows: RankedItem[];
	limit?: number;
}

export interface GenresSlideProps extends BaseSlideProps {
	topGenres: RankedItem[];
	limit?: number;
}

export type DistributionView = 'monthly' | 'hourly' | 'both';

export interface DistributionSlideProps extends BaseSlideProps {
	watchTimeByMonth: MonthlyDistribution;
	watchTimeByHour: HourlyDistribution;
	view?: DistributionView;
}

export interface PercentileSlideProps extends BaseSlideProps {
	percentileRank: number;
	totalUsers?: number;
}

export interface TopViewer {
	rank: number;
	userId: number;
	username: string;
	totalMinutes: number;
}

export interface TopViewersSlideProps extends BaseSlideProps {
	topViewers: TopViewer[];
	limit?: number;
}

export interface BingeSlideProps extends BaseSlideProps {
	longestBinge: BingeSession | null;
}

export interface FirstLastSlideProps extends BaseSlideProps {
	firstWatch: WatchRecord | null;
	lastWatch: WatchRecord | null;
}

export interface FunFactSlideProps extends BaseSlideProps {
	fact: string;
	comparison?: string;
	icon?: string;
}

export interface CustomSlideProps extends BaseSlideProps {
	title: string;
	content: string;
}

export interface FunFactData {
	fact: string;
	comparison?: string;
	icon?: string;
}

export interface SlideRenderConfig {
	type: SlideType | 'fun-fact';
	enabled: boolean;
	sortOrder: number;
	/** Only present for custom slides */
	customSlideId?: number;
	customTitle?: string;
	customContent?: string;
	/** Only present for interspersed fun-fact slides */
	funFact?: FunFactData;
}
