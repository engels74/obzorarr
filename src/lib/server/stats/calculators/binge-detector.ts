import type { BingeSession } from '../types';
import type { PlayHistoryRecord } from '../utils';

/** Maximum gap between plays to be considered a binge session (30 minutes). */
export const BINGE_GAP_THRESHOLD_SECONDS = 30 * 60;

interface SessionBuilder {
	startTime: number;
	endTime: number;
	plays: number;
	totalSeconds: number;
}

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

export function detectLongestBinge(records: PlayHistoryRecord[]): BingeSession | null {
	const sessions = detectAllBingeSessions(records);

	if (sessions.length === 0) {
		return null;
	}

	// Sessions are already sorted by totalMinutes descending
	const longest = sessions[0];
	return longest ?? null;
}
