/**
 * Slide Components Module
 *
 * Exports all slide components for the Year in Review presentation.
 *
 * @module components/slides
 */

// Base component
export { default as BaseSlide } from './BaseSlide.svelte';

// Data slide components
export { default as TotalTimeSlide } from './TotalTimeSlide.svelte';
export { default as TopMoviesSlide } from './TopMoviesSlide.svelte';
export { default as TopShowsSlide } from './TopShowsSlide.svelte';
export { default as GenresSlide } from './GenresSlide.svelte';
export { default as DistributionSlide } from './DistributionSlide.svelte';
export { default as PercentileSlide } from './PercentileSlide.svelte';
export { default as TopViewersSlide } from './TopViewersSlide.svelte';
export { default as BingeSlide } from './BingeSlide.svelte';
export { default as FirstLastSlide } from './FirstLastSlide.svelte';
export { default as FunFactSlide } from './FunFactSlide.svelte';

// Custom content slide
export { default as CustomSlide } from './CustomSlide.svelte';

// Types
export * from './types';
