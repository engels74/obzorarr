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
		minThresholds: { hours: 70 } // At least one full GOT
	},
	{
		id: 'friends-forever',
		factTemplate: 'With {hours} hours watched',
		comparisonTemplate:
			'{Subject} could have seen every Friends episode {friendsCount} times and still been there for them!',
		icon: '☕',
		requiredStats: ['hours'],
		minThresholds: { hours: 90 } // At least one full Friends
	},
	{
		id: 'the-office-hours',
		factTemplate: '{Possessive} {hours} viewing hours',
		comparisonTemplate:
			"That's {theOfficeCount} complete rewatches of The Office - that's what she said!",
		icon: '📎',
		requiredStats: ['hours'],
		minThresholds: { hours: 74 } // At least one full Office
	},
	{
		id: 'stranger-things',
		factTemplate: '{Possessive} {hours} hours of content',
		comparisonTemplate: 'Could take {object} to the Upside Down and back {strangerThingsCount} times!',
		icon: '👾',
		requiredStats: ['hours'],
		minThresholds: { hours: 34 } // At least one full Stranger Things
	},
	{
		id: 'star-wars-saga',
		factTemplate: 'With {hours} hours on screen',
		comparisonTemplate:
			'{Subject} could watch the original Star Wars trilogy {starWarsCount} times - may the Force be with {object}!',
		icon: '⭐',
		requiredStats: ['hours'],
		minThresholds: { hours: 6.4 } // At least one original trilogy
	},
	{
		id: 'breaking-bad-marathon',
		factTemplate: '{Possessive} {hours} hours of viewing',
		comparisonTemplate:
			"Could power through all of Breaking Bad {breakingBadCount} times - {subject}'re the ones who watch!",
		icon: '🧪',
		requiredStats: ['hours'],
		minThresholds: { hours: 62 } // At least one full Breaking Bad
	},
	{
		id: 'the-wire-complete',
		factTemplate: 'With {hours} hours watched',
		comparisonTemplate: "That's {theWireCount} complete viewings of The Wire - indeed!",
		icon: '🔌',
		requiredStats: ['hours'],
		minThresholds: { hours: 60 } // At least one full Wire
	},
	{
		id: 'sopranos-family',
		factTemplate: '{Possessive} {hours} viewing hours',
		comparisonTemplate:
			'Could take {object} through The Sopranos {sopranosCount} times - fuggedaboutit!',
		icon: '🍝',
		requiredStats: ['hours'],
		minThresholds: { hours: 86 } // At least one full Sopranos
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
