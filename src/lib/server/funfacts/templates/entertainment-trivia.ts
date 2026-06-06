import { defineTemplateCategory } from './base';

// Thresholds sit slightly above each source runtime so rounded comparison counts
// never produce an awkward single-rewatch fact.
export const ENTERTAINMENT_TRIVIA_TEMPLATES = defineTemplateCategory('entertainment-trivia', [
	{
		id: 'game-of-thrones-marathon',
		factTemplate: '{Possessive} {hours} hours of watching',
		comparisonTemplate: 'Could get {object} through all of Game of Thrones {gotCount} times!',
		icon: '🐉',
		requiredStats: ['hours'],
		minThresholds: { hours: 74 }
	},
	{
		id: 'friends-forever',
		factTemplate: 'With {hours} hours watched',
		comparisonTemplate:
			'{Subject} could have seen every Friends episode {friendsCount} times and still been there for them!',
		icon: '☕',
		requiredStats: ['hours'],
		minThresholds: { hours: 95 }
	},
	{
		id: 'the-office-hours',
		factTemplate: '{Possessive} {hours} viewing hours',
		comparisonTemplate:
			"That's {theOfficeCount} complete rewatches of The Office - that's what she said!",
		icon: '📎',
		requiredStats: ['hours'],
		minThresholds: { hours: 78 }
	},
	{
		id: 'stranger-things',
		factTemplate: '{Possessive} {hours} hours of content',
		comparisonTemplate:
			'Could take {object} to the Upside Down and back {strangerThingsCount} times!',
		icon: '👾',
		requiredStats: ['hours'],
		minThresholds: { hours: 36 }
	},
	{
		id: 'star-wars-saga',
		factTemplate: 'With {hours} hours on screen',
		comparisonTemplate:
			'{Subject} could watch the original Star Wars trilogy {starWarsCount} times - may the Force be with {object}!',
		icon: '⭐',
		requiredStats: ['hours'],
		minThresholds: { hours: 7 }
	},
	{
		id: 'breaking-bad-marathon',
		factTemplate: '{Possessive} {hours} hours of viewing',
		comparisonTemplate:
			"Could power through all of Breaking Bad {breakingBadCount} times - {subject}'re the ones who watch!",
		icon: '🧪',
		requiredStats: ['hours'],
		minThresholds: { hours: 66 }
	},
	{
		id: 'the-wire-complete',
		factTemplate: 'With {hours} hours watched',
		comparisonTemplate: "That's {theWireCount} complete viewings of The Wire - indeed!",
		icon: '🔌',
		requiredStats: ['hours'],
		minThresholds: { hours: 63 }
	},
	{
		id: 'sopranos-family',
		factTemplate: '{Possessive} {hours} viewing hours',
		comparisonTemplate:
			'Could take {object} through The Sopranos {sopranosCount} times - fuggedaboutit!',
		icon: '🍝',
		requiredStats: ['hours'],
		minThresholds: { hours: 91 }
	},
	{
		id: 'star-wars-quick',
		factTemplate: 'Even with just {hours} hours',
		comparisonTemplate:
			"{Subject} could've had {starWarsCount} Star Wars movie nights - not bad for a scruffy-looking nerf herder!",
		icon: '🚀',
		requiredStats: ['hours'],
		minThresholds: { hours: 2 },
		priority: 35
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
