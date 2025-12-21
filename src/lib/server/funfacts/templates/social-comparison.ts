import { defineTemplateCategory } from './base';

/**
 * Social Comparison Templates
 *
 * Server-relative comparison templates
 * (rankings, above average, percentiles)
 *
 * @module server/funfacts/templates/social-comparison
 */

export const SOCIAL_COMPARISON_TEMPLATES = defineTemplateCategory('social-comparison', [
	{
		id: 'server-champion',
		factTemplate: "You're the #1 viewer on this server!",
		comparisonTemplate: 'The crown is yours, streaming royalty!',
		icon: '👑',
		requiredStats: ['percentile'],
		minThresholds: { percentile: 99 }, // Essentially top 1%
		priority: 80 // Very high priority for top viewer
	},
	{
		id: 'top-five',
		factTemplate: "You're in the top 5% of viewers on this server",
		comparisonTemplate: 'Elite company you keep!',
		icon: '🏅',
		requiredStats: ['percentile'],
		minThresholds: { percentile: 95 },
		priority: 65
	},
	{
		id: 'above-average-double',
		factTemplate: 'You watched more than twice the server average',
		comparisonTemplate: 'Clearly, you take entertainment seriously!',
		icon: '📈',
		requiredStats: ['percentile'],
		minThresholds: { percentile: 85 },
		priority: 55
	},
	{
		id: 'above-average',
		factTemplate: 'You watched more than the average viewer on this server',
		comparisonTemplate: "You're ahead of the pack!",
		icon: '📊',
		requiredStats: ['percentile'],
		minThresholds: { percentile: 60 },
		priority: 45
	},
	{
		id: 'climbing-ranks',
		factTemplate: "You're in the top {topPercentile}% of viewers",
		comparisonTemplate: 'Keep climbing those rankings!',
		icon: '🧗',
		requiredStats: ['percentile'],
		minThresholds: { percentile: 40 },
		priority: 40
	},
	{
		id: 'steady-contributor',
		factTemplate: "You're a valued member of the viewing community",
		comparisonTemplate: 'Every stream counts!',
		icon: '🤝',
		requiredStats: ['plays'],
		minThresholds: { plays: 10 },
		priority: 30 // Lower priority - fallback for lower percentiles
	},
	{
		id: 'quality-over-quantity',
		factTemplate: 'You focus on quality viewing experiences',
		comparisonTemplate: 'Sometimes less is more!',
		icon: '💎',
		requiredStats: ['plays'],
		minThresholds: { plays: 1 },
		priority: 25 // Very low priority - catch-all
	}
]);
