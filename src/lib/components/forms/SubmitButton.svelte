<script lang="ts" module>
import type { Snippet } from 'svelte';
import type { ButtonProps } from '$lib/components/ui/button/button.svelte';

export type SubmitButtonProps = Omit<ButtonProps, 'type' | 'children'> & {
	/** True while the form action is in flight. Disables clicks + flips aria-busy. */
	submitting?: boolean;
	/** Optional snippet for the resting button label (overrides default text). */
	children?: Snippet;
	/** Optional snippet for the submitting state (overrides "Saving…"). */
	submittingLabel?: Snippet;
	/** Plain-text label if no children snippet is supplied. */
	label?: string;
};
</script>

<script lang="ts">
import { Loader2 } from '@lucide/svelte';
import Button from '$lib/components/ui/button/button.svelte';

let {
	submitting = false,
	disabled,
	children,
	submittingLabel,
	label = 'Save',
	...restProps
}: SubmitButtonProps = $props();
</script>

<Button
	type="submit"
	disabled={submitting || disabled}
	aria-busy={submitting}
	aria-live="polite"
	{...restProps}
>
	{#if submitting}
		<Loader2 class="size-4 animate-spin" aria-hidden="true" />
		{#if submittingLabel}
			{@render submittingLabel()}
		{:else}
			Saving…
		{/if}
	{:else if children}
		{@render children()}
	{:else}
		{label}
	{/if}
</Button>
