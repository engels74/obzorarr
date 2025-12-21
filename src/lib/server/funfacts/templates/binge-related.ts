import { defineTemplateCategory } from './base';

/**
 * Binge-Related Templates
 *
 * Templates based on binge watching sessions
 * (marathon sessions, dedication)
 *
 * @module server/funfacts/templates/binge-related
 */

export const BINGE_TEMPLATES = defineTemplateCategory('binge-related', [
	{
		id: 'marathon-session-epic',
		factTemplate: 'Your longest binge was an epic {bingeHours} hours straight',
		comparisonTemplate: "Now that's what we call dedication!",
		icon: '🍿',
		requiredStats: ['bingeHours'],
		minThresholds: { bingeHours: 6 }
	},
	{
		id: 'marathon-session',
		factTemplate: 'You binged for {bingeHours} hours in one sitting',
		comparisonTemplate: 'A respectable marathon session!',
		icon: '🛋️',
		requiredStats: ['bingeHours'],
		minThresholds: { bingeHours: 3 }
	},
	{
		id: 'binge-champion',
		factTemplate: 'You watched {bingePlays} things in your longest binge session',
		comparisonTemplate: 'A true binge-watching champion!',
		icon: '🥇',
		requiredStats: ['bingePlays'],
		minThresholds: { bingePlays: 5 }
	}
]);
