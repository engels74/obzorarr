import { defineTemplateCategory } from './base';

/**
 * Content Comparison Templates
 *
 * Templates based on top content and play patterns
 * (favorite movies, shows, variety)
 *
 * @module server/funfacts/templates/content-comparison
 */

export const CONTENT_COMPARISON_TEMPLATES = defineTemplateCategory('content-comparison', [
	{
		id: 'top-movie-obsession',
		factTemplate: 'You watched "{topMovie}" {topMovieCount} times this year',
		comparisonTemplate: 'You could practically recite it by heart!',
		icon: '🎥',
		requiredStats: ['topMovie', 'topMovieCount'],
		minThresholds: { topMovieCount: 3 }
	},
	{
		id: 'show-dedication',
		factTemplate: 'You watched {topShowCount} episodes of "{topShow}"',
		comparisonTemplate: "Now that's true dedication to a series!",
		icon: '📺',
		requiredStats: ['topShow', 'topShowCount'],
		minThresholds: { topShowCount: 10 }
	},
	{
		id: 'variety-watcher',
		factTemplate: 'You explored {uniqueMovies} different movies this year',
		comparisonTemplate: "That's a new movie every {daysBetweenMovies} days on average!",
		icon: '🎞️',
		requiredStats: ['uniqueMovies'],
		minThresholds: { uniqueMovies: 12 } // At least monthly
	},
	{
		id: 'show-explorer',
		factTemplate: 'You jumped between {uniqueShows} different TV shows',
		comparisonTemplate: 'A true explorer of the television landscape!',
		icon: '🔍',
		requiredStats: ['uniqueShows'],
		minThresholds: { uniqueShows: 5 }
	},
	{
		id: 'movie-starter',
		factTemplate: 'You watched {uniqueMovies} unique movies this year',
		comparisonTemplate: 'Every movie is a new adventure!',
		icon: '🎬',
		requiredStats: ['uniqueMovies'],
		minThresholds: { uniqueMovies: 1 } // Very low threshold
	},
	{
		id: 'show-sampler',
		factTemplate: 'You explored {uniqueShows} different TV shows',
		comparisonTemplate: "That's some serious channel surfing!",
		icon: '📺',
		requiredStats: ['uniqueShows'],
		minThresholds: { uniqueShows: 1 } // Very low threshold
	}
]);
