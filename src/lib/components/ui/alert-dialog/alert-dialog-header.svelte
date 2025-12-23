<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';

	let {
		class: className,
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { children?: Snippet } = $props();
</script>

<div
	data-slot="alert-dialog-header"
	class={cn('flex flex-col space-y-2 text-center sm:text-left', className)}
	{...restProps}
>
	{@render children?.()}
</div>
