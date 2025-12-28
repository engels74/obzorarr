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

	const sorted = [...records].sort((a, b) => a.viewedAt - b.viewedAt);

	const sessions: BingeSession[] = [];
	let currentSession: SessionBuilder | null = null;

	for (const record of sorted) {
		const duration = record.duration ?? 0;

		if (!currentSession) {
			currentSession = {
				startTime: record.viewedAt,
				endTime: record.viewedAt,
				plays: 1,
				totalSeconds: duration
			};
		} else {
			const gap = record.viewedAt - currentSession.endTime;

			if (gap <= BINGE_GAP_THRESHOLD_SECONDS) {
				currentSession.endTime = record.viewedAt;
				currentSession.plays += 1;
				currentSession.totalSeconds += duration;
			} else {
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

	if (currentSession) {
		sessions.push({
			startTime: currentSession.startTime,
			endTime: currentSession.endTime,
			plays: currentSession.plays,
			totalMinutes: currentSession.totalSeconds / 60
		});
	}

	return sessions.sort((a, b) => b.totalMinutes - a.totalMinutes);
}

export function detectLongestBinge(records: PlayHistoryRecord[]): BingeSession | null {
	const sessions = detectAllBingeSessions(records);

	if (sessions.length === 0) {
		return null;
	}

	const longest = sessions[0];
	return longest ?? null;
}
