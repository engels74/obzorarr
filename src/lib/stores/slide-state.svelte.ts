export class SlideStateStore {
	currentSlide = $state(0);
	totalSlides = $state(0);
	isAnimating = $state(false);
	direction = $state<'forward' | 'backward'>('forward');

	canGoNext = $derived(this.currentSlide < this.totalSlides - 1 && !this.isAnimating);
	canGoPrevious = $derived(this.currentSlide > 0 && !this.isAnimating);
	isFirst = $derived(this.currentSlide === 0);
	isLast = $derived(this.currentSlide >= this.totalSlides - 1);
	progress = $derived(
		this.totalSlides > 0 ? ((this.currentSlide + 1) / this.totalSlides) * 100 : 0
	);

	initialize(total: number, startIndex: number = 0): void {
		this.totalSlides = total;
		this.currentSlide = Math.max(0, Math.min(startIndex, total - 1));
		this.isAnimating = false;
		this.direction = 'forward';
	}

	goToNext(): boolean {
		if (!this.canGoNext) return false;

		this.direction = 'forward';
		this.currentSlide++;
		return true;
	}

	goToPrevious(): boolean {
		if (!this.canGoPrevious) return false;

		this.direction = 'backward';
		this.currentSlide--;
		return true;
	}

	goToSlide(index: number): boolean {
		if (this.isAnimating) return false;
		if (index < 0 || index >= this.totalSlides) return false;
		if (index === this.currentSlide) return false;

		this.direction = index > this.currentSlide ? 'forward' : 'backward';
		this.currentSlide = index;
		return true;
	}

	goToFirst(): boolean {
		return this.goToSlide(0);
	}

	goToLast(): boolean {
		return this.goToSlide(this.totalSlides - 1);
	}

	startAnimation(): void {
		this.isAnimating = true;
	}

	endAnimation(): void {
		this.isAnimating = false;
	}

	reset(): void {
		this.currentSlide = 0;
		this.totalSlides = 0;
		this.isAnimating = false;
		this.direction = 'forward';
	}
}

export function createSlideState(): SlideStateStore {
	return new SlideStateStore();
}

export const slideState = new SlideStateStore();
