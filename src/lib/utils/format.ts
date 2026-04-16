export function formatDuration(ms: number): string {
	if (ms < 1000) return '<1s';
	if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
	if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
	return `${Math.floor(ms / 3600000)}h`;
}
