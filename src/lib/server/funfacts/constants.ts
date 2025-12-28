// All values are in hours unless otherwise noted
export const EQUIVALENCY_FACTORS = {
	FLIGHT_NYC_TOKYO_HOURS: 14,
	LOTR_EXTENDED_TOTAL_HOURS: 11.4,
	AVERAGE_BOOK_HOURS: 6,
	WALKING_SPEED_MPH: 3,
	SLEEP_CYCLE_HOURS: 1.5,
	AVERAGE_MOVIE_HOURS: 2,
	MCU_MARATHON_HOURS: 50,
	HARRY_POTTER_TOTAL_HOURS: 19.7,
	COFFEE_BREAK_HOURS: 0.25,
	COMMUTE_HOURS: 0.5,
	PODCAST_EPISODE_HOURS: 0.75
} as const;

export const ENTERTAINMENT_FACTORS = {
	GAME_OF_THRONES_HOURS: 70,
	FRIENDS_HOURS: 90,
	THE_OFFICE_HOURS: 74,
	STRANGER_THINGS_HOURS: 34,
	STAR_WARS_ORIGINAL_TRILOGY_HOURS: 6.4,
	BREAKING_BAD_HOURS: 62,
	THE_SOPRANOS_HOURS: 86,
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
