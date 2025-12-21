import { defineTemplateCategory } from './base';

/**
 * Behavioral Insight Templates
 *
 * Templates based on percentile, viewing patterns, and comparisons
 * (night owl, early bird, peak month)
 *
 * @module server/funfacts/templates/behavioral-insight
 */

export const BEHAVIORAL_TEMPLATES = defineTemplateCategory('behavioral-insight', [
	{
		id: 'top-percentile-elite',
		factTemplate: 'You watched more than {percentile}% of users on this server',
		comparisonTemplate: "You're in the elite tier of viewers!",
		icon: '🏆',
		requiredStats: ['percentile'],
		minThresholds: { percentile: 90 }
	},
	{
		id: 'top-percentile-high',
		factTemplate: 'You outpaced {percentile}% of fellow viewers',
		comparisonTemplate: 'That puts you in the top viewing tier!',
		icon: '🥇',
		requiredStats: ['percentile'],
		minThresholds: { percentile: 75 }
	},
	{
		id: 'night-owl',
		factTemplate: 'Your peak viewing time was {peakHourFormatted}',
		comparisonTemplate: 'The night owl life suits you perfectly!',
		icon: '🦉',
		requiredStats: ['peakHour'],
		minThresholds: { peakHour: 21 } // 9 PM or later
	},
	{
		id: 'early-bird',
		factTemplate: 'You love watching content at {peakHourFormatted}',
		comparisonTemplate: 'Early bird catches the best shows!',
		icon: '🐦',
		requiredStats: ['peakHour', 'plays'],
		// Special handling: peakHour <= 9, plus minimum plays to be meaningful
		minThresholds: { plays: 10 }
	},
	{
		id: 'peak-month',
		factTemplate: '{peakMonthName} was your biggest viewing month',
		comparisonTemplate: 'You really went all-in that month!',
		icon: '📅',
		requiredStats: ['peakMonth', 'plays'],
		minThresholds: { plays: 10 } // Need actual viewing data for this to be meaningful
	},
	{
		id: 'steady-watcher',
		factTemplate: 'You averaged {playsPerDay} plays per day throughout the year',
		comparisonTemplate: 'Consistency is key!',
		icon: '📊',
		requiredStats: ['plays'],
		minThresholds: { plays: 100 } // At least ~every 3-4 days
	},
	{
		id: 'consistent-viewer',
		factTemplate: 'You had {plays} viewing sessions this year',
		comparisonTemplate: 'Each session a moment of entertainment!',
		icon: '▶️',
		requiredStats: ['plays'],
		minThresholds: { plays: 1 } // Very low threshold
	},
	{
		id: 'any-percentile',
		factTemplate: "You're in the top {topPercentile}% of viewers on this server",
		comparisonTemplate: 'Keep on watching!',
		icon: '📊',
		requiredStats: ['percentile'],
		minThresholds: {} // No minimum - always applicable
	}
]);
