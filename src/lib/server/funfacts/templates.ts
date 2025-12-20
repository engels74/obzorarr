import type { FactTemplate } from './types';

/**
 * Predefined Fun Fact Templates
 *
 * Templates are organized by category and include:
 * - Template strings with {placeholder} syntax
 * - Required stats for applicability
 * - Minimum thresholds for meaningful facts
 *
 * Implements Requirement 10.3:
 * Generate comparisons like "You watched X hours, equivalent to Y flights to Tokyo"
 *
 * @module server/funfacts/templates
 */

// =============================================================================
// Constants
// =============================================================================

/**
 * Time equivalency conversion factors
 * All values are in hours unless otherwise noted
 */
export const EQUIVALENCY_FACTORS = {
	/** One-way flight from NYC to Tokyo in hours */
	FLIGHT_NYC_TOKYO_HOURS: 14,
	/** All 3 LOTR extended editions total runtime in hours */
	LOTR_EXTENDED_TOTAL_HOURS: 11.4,
	/** Average time to read a 300-page novel in hours */
	AVERAGE_BOOK_HOURS: 6,
	/** Average walking speed in miles per hour */
	WALKING_SPEED_MPH: 3,
	/** One complete sleep cycle in hours */
	SLEEP_CYCLE_HOURS: 1.5,
	/** Average movie runtime in hours */
	AVERAGE_MOVIE_HOURS: 2,
	/** Full Marvel Cinematic Universe marathon (first 23 films) in hours */
	MCU_MARATHON_HOURS: 50,
	/** Full Harry Potter film series in hours */
	HARRY_POTTER_TOTAL_HOURS: 19.7
} as const;

/**
 * Month names for display
 */
export const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
] as const;

// =============================================================================
// Time Equivalency Templates
// =============================================================================

/**
 * Time Equivalency Templates
 * Convert watch time to relatable real-world comparisons
 */
export const TIME_EQUIVALENCY_TEMPLATES: FactTemplate[] = [
	{
		id: 'flight-tokyo',
		category: 'time-equivalency',
		factTemplate: 'You watched {hours} hours of content this year',
		comparisonTemplate: "That's equivalent to {flightCount} flights from New York to Tokyo!",
		icon: '✈️',
		requiredStats: ['hours'],
		minThresholds: { hours: 14 } // At least one flight worth
	},
	{
		id: 'lotr-marathon',
		category: 'time-equivalency',
		factTemplate: 'Your {hours} hours of viewing',
		comparisonTemplate:
			'Could watch the entire extended Lord of the Rings trilogy {lotrCount} times!',
		icon: '🧙',
		requiredStats: ['hours'],
		minThresholds: { hours: 12 } // At least one full marathon
	},
	{
		id: 'books-read',
		category: 'time-equivalency',
		factTemplate: 'You spent {hours} hours watching content',
		comparisonTemplate: 'In that time, you could have read about {bookCount} novels',
		icon: '📚',
		requiredStats: ['hours'],
		minThresholds: { hours: 6 } // At least one book
	},
	{
		id: 'walk-distance',
		category: 'time-equivalency',
		factTemplate: 'Your {hours} hours of screen time',
		comparisonTemplate: 'You could have walked {walkMiles} miles in that time!',
		icon: '🚶',
		requiredStats: ['hours'],
		minThresholds: { hours: 3 } // At least 9 miles
	},
	{
		id: 'sleep-cycles',
		category: 'time-equivalency',
		factTemplate: 'With {hours} hours of content consumed',
		comparisonTemplate: "That's {sleepCycles} complete sleep cycles of entertainment!",
		icon: '😴',
		requiredStats: ['hours'],
		minThresholds: { hours: 3 } // At least 2 sleep cycles
	},
	{
		id: 'mcu-marathon',
		category: 'time-equivalency',
		factTemplate: 'You watched {hours} hours of content',
		comparisonTemplate:
			"That's like binging the entire MCU Infinity Saga {mcuCount} times over!",
		icon: '🦸',
		requiredStats: ['hours'],
		minThresholds: { hours: 50 } // At least one MCU marathon
	},
	{
		id: 'harry-potter',
		category: 'time-equivalency',
		factTemplate: 'Your {hours} viewing hours',
		comparisonTemplate: 'Could power through all 8 Harry Potter films {hpCount} times!',
		icon: '⚡',
		requiredStats: ['hours'],
		minThresholds: { hours: 20 } // At least one HP marathon
	}
];

// =============================================================================
// Content Comparison Templates
// =============================================================================

/**
 * Content Comparison Templates
 * Based on top content and play patterns
 */
export const CONTENT_COMPARISON_TEMPLATES: FactTemplate[] = [
	{
		id: 'top-movie-obsession',
		category: 'content-comparison',
		factTemplate: 'You watched "{topMovie}" {topMovieCount} times this year',
		comparisonTemplate: "You could practically recite it by heart!",
		icon: '🎥',
		requiredStats: ['topMovie', 'topMovieCount'],
		minThresholds: { topMovieCount: 3 }
	},
	{
		id: 'show-dedication',
		category: 'content-comparison',
		factTemplate: 'You watched {topShowCount} episodes of "{topShow}"',
		comparisonTemplate: "Now that's true dedication to a series!",
		icon: '📺',
		requiredStats: ['topShow', 'topShowCount'],
		minThresholds: { topShowCount: 10 }
	},
	{
		id: 'variety-watcher',
		category: 'content-comparison',
		factTemplate: 'You explored {uniqueMovies} different movies this year',
		comparisonTemplate: "That's a new movie every {daysBetweenMovies} days on average!",
		icon: '🎞️',
		requiredStats: ['uniqueMovies'],
		minThresholds: { uniqueMovies: 12 } // At least monthly
	},
	{
		id: 'show-explorer',
		category: 'content-comparison',
		factTemplate: 'You jumped between {uniqueShows} different TV shows',
		comparisonTemplate: 'A true explorer of the television landscape!',
		icon: '🔍',
		requiredStats: ['uniqueShows'],
		minThresholds: { uniqueShows: 5 }
	}
];

// =============================================================================
// Behavioral Insight Templates
// =============================================================================

/**
 * Behavioral Insight Templates
 * Based on percentile, viewing patterns, and comparisons
 */
export const BEHAVIORAL_TEMPLATES: FactTemplate[] = [
	{
		id: 'top-percentile-elite',
		category: 'behavioral-insight',
		factTemplate: 'You watched more than {percentile}% of users on this server',
		comparisonTemplate: "You're in the elite tier of viewers!",
		icon: '🏆',
		requiredStats: ['percentile'],
		minThresholds: { percentile: 90 }
	},
	{
		id: 'top-percentile-high',
		category: 'behavioral-insight',
		factTemplate: 'You outpaced {percentile}% of fellow viewers',
		comparisonTemplate: "That puts you in the top viewing tier!",
		icon: '🥇',
		requiredStats: ['percentile'],
		minThresholds: { percentile: 75 }
	},
	{
		id: 'night-owl',
		category: 'behavioral-insight',
		factTemplate: 'Your peak viewing time was {peakHourFormatted}',
		comparisonTemplate: 'The night owl life suits you perfectly!',
		icon: '🦉',
		requiredStats: ['peakHour'],
		minThresholds: { peakHour: 21 } // 9 PM or later
	},
	{
		id: 'early-bird',
		category: 'behavioral-insight',
		factTemplate: 'You love watching content at {peakHourFormatted}',
		comparisonTemplate: 'Early bird catches the best shows!',
		icon: '🐦',
		requiredStats: ['peakHour', 'plays'],
		// Special handling: peakHour <= 9, plus minimum plays to be meaningful
		minThresholds: { plays: 10 }
	},
	{
		id: 'peak-month',
		category: 'behavioral-insight',
		factTemplate: '{peakMonthName} was your biggest viewing month',
		comparisonTemplate: 'You really went all-in that month!',
		icon: '📅',
		requiredStats: ['peakMonth', 'plays'],
		minThresholds: { plays: 10 } // Need actual viewing data for this to be meaningful
	},
	{
		id: 'steady-watcher',
		category: 'behavioral-insight',
		factTemplate: 'You averaged {playsPerDay} plays per day throughout the year',
		comparisonTemplate: 'Consistency is key!',
		icon: '📊',
		requiredStats: ['plays'],
		minThresholds: { plays: 100 } // At least ~every 3-4 days
	}
];

// =============================================================================
// Binge-Related Templates
// =============================================================================

/**
 * Binge-Related Templates
 * Based on binge watching sessions
 */
export const BINGE_TEMPLATES: FactTemplate[] = [
	{
		id: 'marathon-session-epic',
		category: 'binge-related',
		factTemplate: 'Your longest binge was an epic {bingeHours} hours straight',
		comparisonTemplate: "Now that's what we call dedication!",
		icon: '🍿',
		requiredStats: ['bingeHours'],
		minThresholds: { bingeHours: 6 }
	},
	{
		id: 'marathon-session',
		category: 'binge-related',
		factTemplate: 'You binged for {bingeHours} hours in one sitting',
		comparisonTemplate: 'A respectable marathon session!',
		icon: '🛋️',
		requiredStats: ['bingeHours'],
		minThresholds: { bingeHours: 3 }
	},
	{
		id: 'binge-champion',
		category: 'binge-related',
		factTemplate: 'You watched {bingePlays} things in your longest binge session',
		comparisonTemplate: 'A true binge-watching champion!',
		icon: '🥇',
		requiredStats: ['bingePlays'],
		minThresholds: { bingePlays: 5 }
	}
];

// =============================================================================
// Temporal Pattern Templates
// =============================================================================

/**
 * Temporal Pattern Templates
 * Based on first/last watch and temporal patterns
 */
export const TEMPORAL_TEMPLATES: FactTemplate[] = [
	{
		id: 'first-of-year',
		category: 'temporal-pattern',
		factTemplate: 'You kicked off the year watching "{firstWatchTitle}"',
		comparisonTemplate: 'What a way to start the year!',
		icon: '🎉',
		requiredStats: ['firstWatchTitle']
	},
	{
		id: 'year-bookends',
		category: 'temporal-pattern',
		factTemplate: 'From "{firstWatchTitle}" to "{lastWatchTitle}"',
		comparisonTemplate: 'What a viewing journey this year has been!',
		icon: '📖',
		requiredStats: ['firstWatchTitle', 'lastWatchTitle']
	},
	{
		id: 'last-of-year',
		category: 'temporal-pattern',
		factTemplate: 'You ended your viewing year with "{lastWatchTitle}"',
		comparisonTemplate: 'A fitting finale to the year!',
		icon: '🎬',
		requiredStats: ['lastWatchTitle']
	}
];

// =============================================================================
// All Templates Combined
// =============================================================================

/**
 * All predefined fun fact templates
 */
export const ALL_TEMPLATES: FactTemplate[] = [
	...TIME_EQUIVALENCY_TEMPLATES,
	...CONTENT_COMPARISON_TEMPLATES,
	...BEHAVIORAL_TEMPLATES,
	...BINGE_TEMPLATES,
	...TEMPORAL_TEMPLATES
];

/**
 * Templates grouped by category for easy access
 */
export const TEMPLATES_BY_CATEGORY: Record<string, FactTemplate[]> = {
	'time-equivalency': TIME_EQUIVALENCY_TEMPLATES,
	'content-comparison': CONTENT_COMPARISON_TEMPLATES,
	'behavioral-insight': BEHAVIORAL_TEMPLATES,
	'binge-related': BINGE_TEMPLATES,
	'temporal-pattern': TEMPORAL_TEMPLATES
};
