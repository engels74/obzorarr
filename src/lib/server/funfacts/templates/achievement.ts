import { defineTemplateCategory } from './base';

/**
 * Achievement Templates
 *
 * Milestone-based templates celebrating viewing accomplishments
 * (Century Club, Marathon Master, milestones)
 *
 * @module server/funfacts/templates/achievement
 */

export const ACHIEVEMENT_TEMPLATES = defineTemplateCategory('achievement', [
	{
		id: 'century-club',
		factTemplate: 'You hit the Century Club with {hours} hours watched!',
		comparisonTemplate: 'Welcome to the triple-digit viewing elite!',
		icon: '💯',
		requiredStats: ['hours'],
		minThresholds: { hours: 100 },
		priority: 70 // Higher priority for major milestones
	},
	{
		id: 'movie-marathon-master',
		factTemplate: 'You watched {uniqueMovies} different movies this year',
		comparisonTemplate: "That's almost a movie a week - you're a true cinephile!",
		icon: '🎖️',
		requiredStats: ['uniqueMovies'],
		minThresholds: { uniqueMovies: 50 },
		priority: 65
	},
	{
		id: 'thousand-plays',
		factTemplate: 'You hit {plays} plays this year!',
		comparisonTemplate: "That's serious dedication to entertainment!",
		icon: '🏆',
		requiredStats: ['plays'],
		minThresholds: { plays: 1000 },
		priority: 75 // Very high priority for rare achievement
	},
	{
		id: 'five-hundred-plays',
		factTemplate: 'You reached {plays} viewing sessions this year',
		comparisonTemplate: "That's more than one a day - impressive commitment!",
		icon: '🥇',
		requiredStats: ['plays'],
		minThresholds: { plays: 500 },
		priority: 60
	},
	{
		id: 'two-hundred-hours',
		factTemplate: 'You crossed the 200-hour mark with {hours} hours!',
		comparisonTemplate: "That's over 8 full days of entertainment!",
		icon: '🌟',
		requiredStats: ['hours'],
		minThresholds: { hours: 200 },
		priority: 68
	},
	{
		id: 'show-completionist',
		factTemplate: 'You watched {topShowCount} episodes of a single show',
		comparisonTemplate: "Now that's what we call a completionist!",
		icon: '✅',
		requiredStats: ['topShowCount'],
		minThresholds: { topShowCount: 50 },
		priority: 55
	},
	{
		id: 'double-digit-movies',
		factTemplate: 'You watched your favorite movie {topMovieCount} times',
		comparisonTemplate: 'You really love that film!',
		icon: '🔁',
		requiredStats: ['topMovieCount'],
		minThresholds: { topMovieCount: 10 },
		priority: 58
	},
	{
		id: 'diverse-explorer',
		factTemplate: 'You explored {uniqueShows} different TV shows',
		comparisonTemplate: "That's a lot of new worlds to discover!",
		icon: '🗺️',
		requiredStats: ['uniqueShows'],
		minThresholds: { uniqueShows: 20 },
		priority: 52
	}
]);
