import Root from './alert-dialog.svelte';
import Action from './alert-dialog-action.svelte';
import Cancel from './alert-dialog-cancel.svelte';
import Content from './alert-dialog-content.svelte';
import Description from './alert-dialog-description.svelte';
import Footer from './alert-dialog-footer.svelte';
import Header from './alert-dialog-header.svelte';
import Overlay from './alert-dialog-overlay.svelte';
import Portal from './alert-dialog-portal.svelte';
import Title from './alert-dialog-title.svelte';
import Trigger from './alert-dialog-trigger.svelte';

export {
	Root,
	Trigger,
	Content,
	Portal,
	Overlay,
	Header,
	Footer,
	Title,
	Description,
	Action,
	Cancel,
	//
	Root as AlertDialog,
	Trigger as AlertDialogTrigger,
	Content as AlertDialogContent,
	Portal as AlertDialogPortal,
	Overlay as AlertDialogOverlay,
	Header as AlertDialogHeader,
	Footer as AlertDialogFooter,
	Title as AlertDialogTitle,
	Description as AlertDialogDescription,
	Action as AlertDialogAction,
	Cancel as AlertDialogCancel
};
