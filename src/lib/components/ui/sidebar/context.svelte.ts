import { getContext, setContext } from 'svelte';
import { IsMobile } from '$lib/hooks/is-mobile.svelte.js';
import { SIDEBAR_KEYBOARD_SHORTCUT } from './constants.js';

type Getter<T> = () => T;

export type SidebarStateProps = {
	/**
	 * Getter-backed so `Sidebar.Provider` can support `bind:open` without
	 * letting child components own the source of truth.
	 */
	open: Getter<boolean>;

	/**
	 * Setter paired with {@link open}; keeping writes routed through the provider
	 * keeps nested sidebar pieces and any external `bind:` reference in sync.
	 */
	setOpen: (open: boolean) => void;
};

class SidebarState {
	readonly props: SidebarStateProps;
	open = $derived.by(() => this.props.open());
	openMobile = $state(false);
	setOpen: SidebarStateProps['setOpen'];
	#isMobile: IsMobile;
	state = $derived.by(() => (this.open ? 'expanded' : 'collapsed'));

	constructor(props: SidebarStateProps) {
		this.setOpen = props.setOpen;
		this.#isMobile = new IsMobile();
		this.props = props;
	}

	// Expose only the boolean so consumers cannot depend on the internal IsMobile rune wrapper.
	get isMobile() {
		return this.#isMobile.current;
	}

	handleShortcutKeydown = (e: KeyboardEvent) => {
		if (e.key === SIDEBAR_KEYBOARD_SHORTCUT && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			this.toggle();
		}
	};

	setOpenMobile = (value: boolean) => {
		this.openMobile = value;
	};

	toggle = () => {
		if (this.#isMobile.current) {
			this.openMobile = !this.openMobile;
			return;
		}
		this.setOpen(!this.open);
	};
}

const SYMBOL_KEY = 'scn-sidebar';

/**
 * Keeps `Sidebar.Provider` as the single writer for `bind:open` while exposing
 * the same state object to nested sidebar primitives through Svelte context.
 */
export function setSidebar(props: SidebarStateProps): SidebarState {
	return setContext(Symbol.for(SYMBOL_KEY), new SidebarState(props));
}

/**
 * Returns a class instance; do not destructure it, or Svelte will lose access
 * to the reactive getters on the prototype.
 */
export function useSidebar(): SidebarState {
	return getContext(Symbol.for(SYMBOL_KEY));
}
