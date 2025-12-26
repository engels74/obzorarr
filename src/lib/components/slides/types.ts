import type { Snippet } from 'svelte';
import type {
	RankedItem,
	BingeSession,
	WatchRecord,
	MonthlyDistribution,
	HourlyDistribution
} from '$lib/server/stats/types';

/**
 * Slide type identifiers matching slideConfig.slideType
 * Note: 'fun-fact' is no longer a configurable slide type - it's interspersed dynamically
 */
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

/**
 * Default slide order configuration
 */
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

/**
 * Base props shared by all slide components
 */
export interface BaseSlideProps {
	/** Whether the slide is currently active/visible */
	active?: boolean;
	/** Callback when slide animation completes */
	onAnimationComplete?: () => void;
	/** Additional CSS classes */
	class?: string;
	/** Optional children snippet for additional content */
	children?: Snippet;
}

/**
 * Props for TotalTimeSlide component
 */
export interface TotalTimeSlideProps extends BaseSlideProps {
	totalWatchTimeMinutes: number;
}

/**
 * Props for TopMoviesSlide component
 */
export interface TopMoviesSlideProps extends BaseSlideProps {
	topMovies: RankedItem[];
	/** Maximum items to display (default: 6) */
	limit?: number;
}

/**
 * Props for TopShowsSlide component
 */
export interface TopShowsSlideProps extends BaseSlideProps {
	topShows: RankedItem[];
	/** Maximum items to display (default: 6) */
	limit?: number;
}

/**
 * Props for GenresSlide component
 */
export interface GenresSlideProps extends BaseSlideProps {
	topGenres: RankedItem[];
	/** Maximum genres to display (default: 5) */
	limit?: number;
}

/**
 * Distribution view mode
 */
export type DistributionView = 'monthly' | 'hourly' | 'both';

/**
 * Props for DistributionSlide component
 */
export interface DistributionSlideProps extends BaseSlideProps {
	watchTimeByMonth: MonthlyDistribution;
	watchTimeByHour: HourlyDistribution;
	/** Which distribution to show */
	view?: DistributionView;
}

/**
 * Props for PercentileSlide component
 */
export interface PercentileSlideProps extends BaseSlideProps {
	percentileRank: number; // 0-100
	totalUsers?: number;
}

/**
 * Top viewer entry for server-wide wrapped
 */
export interface TopViewer {
	rank: number;
	userId: number;
	username: string;
	totalMinutes: number;
}

/**
 * Props for TopViewersSlide component
 */
export interface TopViewersSlideProps extends BaseSlideProps {
	topViewers: TopViewer[];
	/** Maximum items to display (default: 5) */
	limit?: number;
}

/**
 * Props for BingeSlide component
 */
export interface BingeSlideProps extends BaseSlideProps {
	longestBinge: BingeSession | null;
}

/**
 * Props for FirstLastSlide component
 */
export interface FirstLastSlideProps extends BaseSlideProps {
	firstWatch: WatchRecord | null;
	lastWatch: WatchRecord | null;
}

/**
 * Props for FunFactSlide component
 */
export interface FunFactSlideProps extends BaseSlideProps {
	fact: string;
	/** Optional comparison value */
	comparison?: string;
	/** Optional icon/emoji */
	icon?: string;
}

/**
 * Props for CustomSlide component
 */
export interface CustomSlideProps extends BaseSlideProps {
	title: string;
	content: string; // Markdown content
}

/**
 * Fun fact data for interspersed slides
 */
export interface FunFactData {
	fact: string;
	comparison?: string;
	icon?: string;
}

/**
 * Slide configuration for rendering
 * Note: 'fun-fact' type is used for interspersed fun facts (render-only, not configurable)
 */
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
