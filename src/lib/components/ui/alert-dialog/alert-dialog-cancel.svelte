<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: AlertDialogPrimitive.CancelProps = $props();
</script>

<AlertDialogPrimitive.Cancel
	bind:ref
	data-slot="alert-dialog-cancel"
	class={cn(
		'inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-semibold ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
		className
	)}
	style="display: inline-flex; height: 2.5rem; align-items: center; justify-content: center; border-radius: 0.375rem; border: 1px solid hsl(var(--input)); background-color: hsl(var(--background)); padding: 0.5rem 1rem; font-size: 0.875rem; font-weight: 600; color: hsl(var(--foreground)); transition: background-color 0.15s ease;"
	{...restProps}
/>
