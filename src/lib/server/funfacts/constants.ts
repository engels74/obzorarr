// All values are in hours unless otherwise noted
export const EQUIVALENCY_FACTORS = {
	/** One-way flight from NYC to Tokyo in hours */
	FLIGHT_NYC_TOKYO_HOURS: 14,
	/** All 3 LOTR extended editions total runtime in hours */
	LOTR_EXTENDED_TOTAL_HOURS: 11.4,
	/** Average time to read a 300-page novel in hours */
	AVERAGE_BOOK_HOURS: 6,
	/** Average walking speed in miles per hour */
	WALKING_SPEED_MPH: 3,
	/** One complete sleep cycle in hours */
	SLEEP_CYCLE_HOURS: 1.5,
	/** Average movie runtime in hours */
	AVERAGE_MOVIE_HOURS: 2,
	/** Full Marvel Cinematic Universe marathon (first 23 films) in hours */
	MCU_MARATHON_HOURS: 50,
	/** Full Harry Potter film series in hours */
	HARRY_POTTER_TOTAL_HOURS: 19.7,
	/** Average coffee break duration in hours (15 min) */
	COFFEE_BREAK_HOURS: 0.25,
	/** Average one-way commute time in hours (30 min) */
	COMMUTE_HOURS: 0.5,
	/** Average podcast episode length in hours (45 min) */
	PODCAST_EPISODE_HOURS: 0.75
} as const;

export const ENTERTAINMENT_FACTORS = {
	/** Game of Thrones complete series (8 seasons) in hours */
	GAME_OF_THRONES_HOURS: 70,
	/** Friends complete series (10 seasons) in hours */
	FRIENDS_HOURS: 90,
	/** The Office (US) complete series in hours */
	THE_OFFICE_HOURS: 74,
	/** Stranger Things complete series in hours */
	STRANGER_THINGS_HOURS: 34,
	/** Star Wars original trilogy in hours */
	STAR_WARS_ORIGINAL_TRILOGY_HOURS: 6.4,
	/** Breaking Bad complete series in hours */
	BREAKING_BAD_HOURS: 62,
	/** The Sopranos complete series in hours */
	THE_SOPRANOS_HOURS: 86,
	/** The Wire complete series in hours */
	THE_WIRE_HOURS: 60
} as const;

export const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
] as const;

export function formatHour(hour: number): string {
	const period = hour >= 12 ? 'PM' : 'AM';
	const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
	return `${displayHour}:00 ${period}`;
}
