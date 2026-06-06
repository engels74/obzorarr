import { defineTemplateCategory } from './base';

// Thresholds avoid underwhelming 1x/0x comparison facts after the display values
// are rounded for copy.
export const TIME_EQUIVALENCY_TEMPLATES = defineTemplateCategory('time-equivalency', [
	{
		id: 'flight-tokyo',
		factTemplate: '{Subject} watched {hours} hours of content this year',
		comparisonTemplate: "That's equivalent to {flightCount} flights from New York to Tokyo!",
		icon: '✈️',
		requiredStats: ['hours'],
		minThresholds: { hours: 15 }
	},
	{
		id: 'lotr-marathon',
		factTemplate: '{Possessive} {hours} hours of viewing',
		comparisonTemplate:
			'Could watch the entire extended Lord of the Rings trilogy {lotrCount} times!',
		icon: '🧙',
		requiredStats: ['hours'],
		minThresholds: { hours: 12 }
	},
	{
		id: 'books-read',
		factTemplate: '{Subject} spent {hours} hours watching content',
		comparisonTemplate: 'In that time, {subject} could have read about {bookCount} novels',
		icon: '📚',
		requiredStats: ['hours'],
		minThresholds: { hours: 9 }
	},
	{
		id: 'walk-distance',
		factTemplate: '{Possessive} {hours} hours of screen time',
		comparisonTemplate: '{Subject} could have walked {walkMiles} miles in that time!',
		icon: '🚶',
		requiredStats: ['hours'],
		minThresholds: { hours: 3 }
	},
	{
		id: 'sleep-cycles',
		factTemplate: 'With {hours} hours of content consumed',
		comparisonTemplate: "That's {sleepCycles} complete sleep cycles of entertainment!",
		icon: '😴',
		requiredStats: ['hours'],
		minThresholds: { hours: 3 }
	},
	{
		id: 'mcu-marathon',
		factTemplate: '{Subject} watched {hours} hours of content',
		comparisonTemplate: "That's like binging the entire MCU Infinity Saga {mcuCount} times over!",
		icon: '🦸',
		requiredStats: ['hours'],
		minThresholds: { hours: 53 }
	},
	{
		id: 'harry-potter',
		factTemplate: '{Possessive} {hours} viewing hours',
		comparisonTemplate: 'Could power through all 8 Harry Potter films {hpCount} times!',
		icon: '⚡',
		requiredStats: ['hours'],
		minThresholds: { hours: 21 }
	},
	{
		id: 'coffee-breaks',
		factTemplate: '{Subject} watched {hours} hours of content this year',
		comparisonTemplate: "That's enough time for {coffeeBreaks} coffee breaks!",
		icon: '☕',
		requiredStats: ['hours'],
		minThresholds: { hours: 1 }
	},
	{
		id: 'commute-time',
		factTemplate: '{Possessive} {hours} hours of viewing',
		comparisonTemplate: 'Would cover {commuteTrips} average work commutes!',
		icon: '🚗',
		requiredStats: ['hours'],
		minThresholds: { hours: 1 }
	},
	{
		id: 'podcast-episodes',
		factTemplate: 'With {hours} hours of content consumed',
		comparisonTemplate: "That's like listening to {podcastEpisodes} podcast episodes!",
		icon: '🎙️',
		requiredStats: ['hours'],
		minThresholds: { hours: 2 }
	}
]);
