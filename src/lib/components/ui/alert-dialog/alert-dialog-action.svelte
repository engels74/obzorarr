<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AlertDialogPrimitive.ActionProps = $props();
</script>

<AlertDialogPrimitive.Action
	bind:ref
	data-slot="alert-dialog-action"
	class={cn(
		'inline-flex h-10 items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground ring-offset-background transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
		className
	)}
	style="display: inline-flex; height: 2.5rem; align-items: center; justify-content: center; border-radius: 0.375rem; background-color: hsl(var(--destructive)); padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 600; color: hsl(var(--destructive-foreground)); transition: background-color 0.15s ease; gap: 0.5rem;"
	{...restProps}
/>
