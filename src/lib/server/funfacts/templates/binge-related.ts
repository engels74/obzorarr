import { defineTemplateCategory } from './base';

export const BINGE_TEMPLATES = defineTemplateCategory('binge-related', [
	{
		id: 'marathon-session-epic',
		factTemplate: '{Possessive} longest binge was an epic {bingeHours} hours straight',
		comparisonTemplate: "Now that's what {subject} call dedication!",
		icon: '🍿',
		requiredStats: ['bingeHours'],
		minThresholds: { bingeHours: 6 }
	},
	{
		id: 'marathon-session',
		factTemplate: '{Subject} binged for {bingeHours} hours in one sitting',
		comparisonTemplate: 'A respectable marathon session!',
		icon: '🛋️',
		requiredStats: ['bingeHours'],
		minThresholds: { bingeHours: 3 }
	},
	{
		id: 'binge-champion',
		factTemplate: '{Subject} watched {bingePlays} things in {possessive} longest binge session',
		comparisonTemplate: 'A true binge-watching champion!',
		icon: '🥇',
		requiredStats: ['bingePlays'],
		minThresholds: { bingePlays: 5 }
	}
]);
