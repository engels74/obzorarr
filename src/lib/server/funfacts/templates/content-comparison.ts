import { defineTemplateCategory } from './base';

export const CONTENT_COMPARISON_TEMPLATES = defineTemplateCategory('content-comparison', [
	{
		id: 'top-movie-obsession',
		factTemplate: '{Subject} watched "{topMovie}" {topMovieCount} times this year',
		comparisonTemplate: '{Subject} could practically recite it by heart!',
		icon: '🎥',
		requiredStats: ['topMovie', 'topMovieCount'],
		minThresholds: { topMovieCount: 3 }
	},
	{
		id: 'show-dedication',
		factTemplate: '{Subject} watched {topShowCount} episodes of "{topShow}"',
		comparisonTemplate: "Now that's true dedication to a series!",
		icon: '📺',
		requiredStats: ['topShow', 'topShowCount'],
		minThresholds: { topShowCount: 10 }
	},
	{
		id: 'variety-watcher',
		factTemplate: '{Subject} explored {uniqueMovies} different movies this year',
		comparisonTemplate: "That's a new movie every {daysBetweenMovies} days on average!",
		icon: '🎞️',
		requiredStats: ['uniqueMovies'],
		minThresholds: { uniqueMovies: 12 }
	},
	{
		id: 'show-explorer',
		factTemplate: '{Subject} jumped between {uniqueShows} different TV shows',
		comparisonTemplate: 'A true explorer of the television landscape!',
		icon: '🔍',
		requiredStats: ['uniqueShows'],
		minThresholds: { uniqueShows: 5 }
	},
	{
		id: 'movie-starter',
		factTemplate: '{Subject} watched {uniqueMovies} unique movies this year',
		comparisonTemplate: 'Every movie is a new adventure!',
		icon: '🎬',
		requiredStats: ['uniqueMovies'],
		minThresholds: { uniqueMovies: 1 }
	},
	{
		id: 'show-sampler',
		factTemplate: '{Subject} explored {uniqueShows} different TV shows',
		comparisonTemplate: "That's some serious channel surfing!",
		icon: '📺',
		requiredStats: ['uniqueShows'],
		minThresholds: { uniqueShows: 1 }
	}
]);
