<script lang="ts">
import { goto } from '$app/navigation';
import { page } from '$app/stores';

const status = $derived($page.status);
const message = $derived($page.error?.message ?? '');

const title = $derived.by(() => {
	if (status === 404) return 'Page not found';
	if (status === 403) return 'Access denied';
	if (status === 429) return 'Too many requests';
	if (status >= 500) return 'Something went wrong';
	return 'Error';
});

const description = $derived.by(() => {
	if (message) return message;
	if (status === 404) return "We couldn't find the page you were looking for.";
	if (status === 403) return "You don't have permission to view this page.";
	if (status === 429) return 'Please slow down and try again in a moment.';
	if (status >= 500) return 'An unexpected error occurred on the server.';
	return 'An unexpected error occurred.';
});

function goHome(): void {
	goto('/');
}

function goBack(): void {
	if (typeof window !== 'undefined' && window.history.length > 1) {
		window.history.back();
	} else {
		goto('/');
	}
}
</script>

<svelte:head>
	<title>{title} - Obzorarr</title>
</svelte:head>

<div class="error-page">
	<div class="error-card">
		<div class="status-code">{status}</div>
		<h1>{title}</h1>
		<p>{description}</p>
		<div class="actions">
			<button type="button" class="btn secondary" onclick={goBack}>Go back</button>
			<button type="button" class="btn primary" onclick={goHome}>Home</button>
		</div>
	</div>
</div>

<style>
	.error-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background: hsl(var(--background));
	}

	.error-card {
		max-width: 480px;
		width: 100%;
		text-align: center;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		padding: 2.5rem 2rem;
	}

	.status-code {
		font-size: 4rem;
		font-weight: 800;
		color: hsl(var(--primary));
		line-height: 1;
		margin-bottom: 0.5rem;
	}

	h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0 0 0.75rem;
		color: hsl(var(--foreground));
	}

	p {
		color: hsl(var(--muted-foreground));
		margin: 0 0 2rem;
		line-height: 1.5;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		flex-wrap: wrap;
	}

	.btn {
		padding: 0.625rem 1.25rem;
		border-radius: var(--radius);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		border: 1px solid hsl(var(--border));
		transition: opacity 0.15s ease;
	}

	.btn:hover {
		opacity: 0.85;
	}

	.btn.primary {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.btn.secondary {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
</style>
