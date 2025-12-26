import { defineTemplateCategory } from './base';

/**
 * Entertainment Trivia Templates
 *
 * Pop culture comparison templates using famous shows/movies
 * (Game of Thrones, Friends, Star Wars, etc.)
 *
 * @module server/funfacts/templates/entertainment-trivia
 */

export const ENTERTAINMENT_TRIVIA_TEMPLATES = defineTemplateCategory('entertainment-trivia', [
	{
		id: 'game-of-thrones-marathon',
		factTemplate: '{Possessive} {hours} hours of watching',
		comparisonTemplate: 'Could get {object} through all of Game of Thrones {gotCount} times!',
		icon: '🐉',
		requiredStats: ['hours'],
		minThresholds: { hours: 74 } // Ensures count > 1 (70 * 1.05 = 73.5)
	},
	{
		id: 'friends-forever',
		factTemplate: 'With {hours} hours watched',
		comparisonTemplate:
			'{Subject} could have seen every Friends episode {friendsCount} times and still been there for them!',
		icon: '☕',
		requiredStats: ['hours'],
		minThresholds: { hours: 95 } // Ensures count > 1 (90 * 1.05 = 94.5)
	},
	{
		id: 'the-office-hours',
		factTemplate: '{Possessive} {hours} viewing hours',
		comparisonTemplate:
			"That's {theOfficeCount} complete rewatches of The Office - that's what she said!",
		icon: '📎',
		requiredStats: ['hours'],
		minThresholds: { hours: 78 } // Ensures count > 1 (74 * 1.05 = 77.7)
	},
	{
		id: 'stranger-things',
		factTemplate: '{Possessive} {hours} hours of content',
		comparisonTemplate:
			'Could take {object} to the Upside Down and back {strangerThingsCount} times!',
		icon: '👾',
		requiredStats: ['hours'],
		minThresholds: { hours: 36 } // Ensures count > 1 (34 * 1.05 = 35.7)
	},
	{
		id: 'star-wars-saga',
		factTemplate: 'With {hours} hours on screen',
		comparisonTemplate:
			'{Subject} could watch the original Star Wars trilogy {starWarsCount} times - may the Force be with {object}!',
		icon: '⭐',
		requiredStats: ['hours'],
		minThresholds: { hours: 7 } // Ensures count > 1 (6.4 * 1.05 = 6.72)
	},
	{
		id: 'breaking-bad-marathon',
		factTemplate: '{Possessive} {hours} hours of viewing',
		comparisonTemplate:
			"Could power through all of Breaking Bad {breakingBadCount} times - {subject}'re the ones who watch!",
		icon: '🧪',
		requiredStats: ['hours'],
		minThresholds: { hours: 66 } // Ensures count > 1 (62 * 1.05 = 65.1)
	},
	{
		id: 'the-wire-complete',
		factTemplate: 'With {hours} hours watched',
		comparisonTemplate: "That's {theWireCount} complete viewings of The Wire - indeed!",
		icon: '🔌',
		requiredStats: ['hours'],
		minThresholds: { hours: 63 } // Ensures count > 1 (60 * 1.05 = 63)
	},
	{
		id: 'sopranos-family',
		factTemplate: '{Possessive} {hours} viewing hours',
		comparisonTemplate:
			'Could take {object} through The Sopranos {sopranosCount} times - fuggedaboutit!',
		icon: '🍝',
		requiredStats: ['hours'],
		minThresholds: { hours: 91 } // Ensures count > 1 (86 * 1.05 = 90.3)
	},
	{
		id: 'star-wars-quick',
		factTemplate: 'Even with just {hours} hours',
		comparisonTemplate:
			"{Subject} could've had {starWarsCount} Star Wars movie nights - not bad for a scruffy-looking nerf herder!",
		icon: '🚀',
		requiredStats: ['hours'],
		minThresholds: { hours: 2 }, // Very low - accessible
		priority: 35 // Lower priority for quick comparison
	},
	{
		id: 'quick-binge-comparison',
		factTemplate: '{Possessive} {hours} hours of content',
		comparisonTemplate: "That's {strangerThingsCount} Stranger Things marathons waiting to happen!",
		icon: '📺',
		requiredStats: ['hours'],
		minThresholds: { hours: 10 },
		priority: 40
	}
]);
