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
	data-slot="alert-dialog-header"
	class={cn('flex flex-col space-y-2 text-center sm:text-left', className)}
	style="display: flex; flex-direction: column; gap: 0.5rem;"
	{...restProps}
>
	{@render children?.()}
</div>
