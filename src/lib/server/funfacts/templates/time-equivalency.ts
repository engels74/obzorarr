import { defineTemplateCategory } from './base';

/**
 * Time Equivalency Templates
 *
 * Convert watch time to relatable real-world comparisons
 * (flights, book reading, marathons, etc.)
 *
 * @module server/funfacts/templates/time-equivalency
 */

export const TIME_EQUIVALENCY_TEMPLATES = defineTemplateCategory('time-equivalency', [
	{
		id: 'flight-tokyo',
		factTemplate: '{Subject} watched {hours} hours of content this year',
		comparisonTemplate: "That's equivalent to {flightCount} flights from New York to Tokyo!",
		icon: '✈️',
		requiredStats: ['hours'],
		minThresholds: { hours: 15 } // Ensures count > 1 (14 * 1.05 = 14.7)
	},
	{
		id: 'lotr-marathon',
		factTemplate: '{Possessive} {hours} hours of viewing',
		comparisonTemplate:
			'Could watch the entire extended Lord of the Rings trilogy {lotrCount} times!',
		icon: '🧙',
		requiredStats: ['hours'],
		minThresholds: { hours: 12 } // 12/11.4 = 1.05 rounds to 1.1 ✓
	},
	{
		id: 'books-read',
		factTemplate: '{Subject} spent {hours} hours watching content',
		comparisonTemplate: 'In that time, {subject} could have read about {bookCount} novels',
		icon: '📚',
		requiredStats: ['hours'],
		minThresholds: { hours: 9 } // Ensures count > 1 (9/6 = 1.5 rounds to 2)
	},
	{
		id: 'walk-distance',
		factTemplate: '{Possessive} {hours} hours of screen time',
		comparisonTemplate: '{Subject} could have walked {walkMiles} miles in that time!',
		icon: '🚶',
		requiredStats: ['hours'],
		minThresholds: { hours: 3 } // 3 * 3mph = 9 miles ✓
	},
	{
		id: 'sleep-cycles',
		factTemplate: 'With {hours} hours of content consumed',
		comparisonTemplate: "That's {sleepCycles} complete sleep cycles of entertainment!",
		icon: '😴',
		requiredStats: ['hours'],
		minThresholds: { hours: 3 } // 3/1.5 = 2 cycles ✓
	},
	{
		id: 'mcu-marathon',
		factTemplate: '{Subject} watched {hours} hours of content',
		comparisonTemplate: "That's like binging the entire MCU Infinity Saga {mcuCount} times over!",
		icon: '🦸',
		requiredStats: ['hours'],
		minThresholds: { hours: 53 } // Ensures count > 1 (50 * 1.05 = 52.5)
	},
	{
		id: 'harry-potter',
		factTemplate: '{Possessive} {hours} viewing hours',
		comparisonTemplate: 'Could power through all 8 Harry Potter films {hpCount} times!',
		icon: '⚡',
		requiredStats: ['hours'],
		minThresholds: { hours: 21 } // Ensures count > 1 (19.7 * 1.05 = 20.7)
	},
	{
		id: 'coffee-breaks',
		factTemplate: '{Subject} watched {hours} hours of content this year',
		comparisonTemplate: "That's enough time for {coffeeBreaks} coffee breaks!",
		icon: '☕',
		requiredStats: ['hours'],
		minThresholds: { hours: 1 } // 1/0.25 = 4 breaks ✓
	},
	{
		id: 'commute-time',
		factTemplate: '{Possessive} {hours} hours of viewing',
		comparisonTemplate: 'Would cover {commuteTrips} average work commutes!',
		icon: '🚗',
		requiredStats: ['hours'],
		minThresholds: { hours: 1 } // 1/0.5 = 2 commutes ✓
	},
	{
		id: 'podcast-episodes',
		factTemplate: 'With {hours} hours of content consumed',
		comparisonTemplate: "That's like listening to {podcastEpisodes} podcast episodes!",
		icon: '🎙️',
		requiredStats: ['hours'],
		minThresholds: { hours: 2 } // Ensures count > 1 (2/0.75 = 2.67 rounds to 3)
	}
]);
