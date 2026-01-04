<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	let {
		class: className,
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div
	data-slot="alert-dialog-footer"
	class={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
	style="display: flex; flex-direction: row; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;"
	{...restProps}
>
	{@render children?.()}
</div>
