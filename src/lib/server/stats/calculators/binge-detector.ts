/**
 * Binge Session Detector
 *
 * Property 14: Binge Session Detection
 * For any sequence of plays, the longest binge session SHALL be the maximum
 * contiguous sequence where each consecutive pair has viewedAt difference <= 30 minutes.
 */

import type { BingeSession } from '../types';
import type { PlayHistoryRecord } from '../utils';

/**
 * Maximum gap between plays to be considered a binge session (in seconds)
 * 30 minutes = 1800 seconds
 */
export const BINGE_GAP_THRESHOLD_SECONDS = 30 * 60;

/**
 * Internal representation of a binge session being built
 */
interface SessionBuilder {
	startTime: number;
	endTime: number;
	plays: number;
	totalSeconds: number;
}

/**
 * Detect all binge sessions from play history
 *
 * A binge session is a sequence of consecutive plays where the gap
 * between each play is at most 30 minutes.
 *
 * @param records - Play history records
 * @returns All binge sessions sorted by totalMinutes descending
 */
export function detectAllBingeSessions(records: PlayHistoryRecord[]): BingeSession[] {
	if (records.length === 0) {
		return [];
	}

	// Sort records by viewedAt ascending
	const sorted = [...records].sort((a, b) => a.viewedAt - b.viewedAt);

	const sessions: BingeSession[] = [];
	let currentSession: SessionBuilder | null = null;

	for (const record of sorted) {
		const duration = record.duration ?? 0;

		if (!currentSession) {
			// Start a new session
			currentSession = {
				startTime: record.viewedAt,
				endTime: record.viewedAt,
				plays: 1,
				totalSeconds: duration
			};
		} else {
			// Check if this record continues the current session
			const gap = record.viewedAt - currentSession.endTime;

			if (gap <= BINGE_GAP_THRESHOLD_SECONDS) {
				// Continue the session
				currentSession.endTime = record.viewedAt;
				currentSession.plays += 1;
				currentSession.totalSeconds += duration;
			} else {
				// Gap too large, save current session and start new one
				sessions.push({
					startTime: currentSession.startTime,
					endTime: currentSession.endTime,
					plays: currentSession.plays,
					totalMinutes: currentSession.totalSeconds / 60
				});

				currentSession = {
					startTime: record.viewedAt,
					endTime: record.viewedAt,
					plays: 1,
					totalSeconds: duration
				};
			}
		}
	}

	// Don't forget the last session
	if (currentSession) {
		sessions.push({
			startTime: currentSession.startTime,
			endTime: currentSession.endTime,
			plays: currentSession.plays,
			totalMinutes: currentSession.totalSeconds / 60
		});
	}

	// Sort by totalMinutes descending
	return sessions.sort((a, b) => b.totalMinutes - a.totalMinutes);
}

/**
 * Detect the longest binge session from play history
 *
 * @param records - Play history records
 * @returns Longest binge session or null if no plays
 *
 * @example
 * ```ts
 * // Records with gaps:
 * // 10:00 - Movie A (90 min)
 * // 11:20 - Movie B (120 min) <- 10 min gap from end of A
 * // 15:00 - Movie C (90 min) <- 2 hour gap, new session
 *
 * const binge = detectLongestBinge(records);
 * // binge = { startTime: 10:00, endTime: 11:20, plays: 2, totalMinutes: 210 }
 * ```
 */
export function detectLongestBinge(records: PlayHistoryRecord[]): BingeSession | null {
	const sessions = detectAllBingeSessions(records);

	if (sessions.length === 0) {
		return null;
	}

	// Sessions are already sorted by totalMinutes descending
	const longest = sessions[0];
	return longest ?? null;
}
