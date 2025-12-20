import type { Snippet } from 'svelte';
import type { RankedItem, BingeSession, WatchRecord } from '$lib/server/stats/types';

/**
 * Slide type identifiers matching slideConfig.slideType
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
	| 'fun-fact'
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
	'first-last',
	'fun-fact'
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
	/** Maximum items to display (default: 5) */
	limit?: number;
}

/**
 * Props for TopShowsSlide component
 */
export interface TopShowsSlideProps extends BaseSlideProps {
	topShows: RankedItem[];
	/** Maximum items to display (default: 5) */
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
	watchTimeByMonth: number[]; // Length: 12
	watchTimeByHour: number[]; // Length: 24
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
 * Slide configuration for rendering
 */
export interface SlideRenderConfig {
	type: SlideType;
	enabled: boolean;
	sortOrder: number;
	/** Only present for custom slides */
	customSlideId?: number;
	customTitle?: string;
	customContent?: string;
}
