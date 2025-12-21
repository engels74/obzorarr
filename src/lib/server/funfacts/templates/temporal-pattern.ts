import { defineTemplateCategory } from './base';

/**
 * Temporal Pattern Templates
 *
 * Templates based on first/last watch and temporal patterns
 * (year bookends, milestones)
 *
 * @module server/funfacts/templates/temporal-pattern
 */

export const TEMPORAL_TEMPLATES = defineTemplateCategory('temporal-pattern', [
	{
		id: 'first-of-year',
		factTemplate: 'You kicked off the year watching "{firstWatchTitle}"',
		comparisonTemplate: 'What a way to start the year!',
		icon: '🎉',
		requiredStats: ['firstWatchTitle']
	},
	{
		id: 'year-bookends',
		factTemplate: 'From "{firstWatchTitle}" to "{lastWatchTitle}"',
		comparisonTemplate: 'What a viewing journey this year has been!',
		icon: '📖',
		requiredStats: ['firstWatchTitle', 'lastWatchTitle']
	},
	{
		id: 'last-of-year',
		factTemplate: 'You ended your viewing year with "{lastWatchTitle}"',
		comparisonTemplate: 'A fitting finale to the year!',
		icon: '🎬',
		requiredStats: ['lastWatchTitle']
	},
	{
		id: 'year-participant',
		factTemplate: 'You were an active viewer in {year}',
		comparisonTemplate: "Here's to another year of great content!",
		icon: '🎊',
		requiredStats: [],
		minThresholds: {} // Always applicable
	}
]);
