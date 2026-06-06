<script lang="ts" module>
import type { Snippet } from 'svelte';
import type { ButtonProps } from '$lib/components/ui/button/button.svelte';

export type SubmitButtonProps = Omit<ButtonProps, 'type' | 'children'> & {
	submitting?: boolean;
	children?: Snippet;
	submittingLabel?: Snippet;
	label?: string;
};
</script>

<script lang="ts">
import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
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
		<LoaderCircleIcon class="size-4 animate-spin" aria-hidden="true" />
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
