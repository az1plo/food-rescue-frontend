import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../../../shared/icons/app-icons';
import { ALLERGEN_OPTIONS, OFFER_CATEGORY_OPTIONS } from '../../../../models/offer.model';
import { RADIUS_PRESET_OPTIONS } from '../../browse-offers.models';
import {
  cloneOfferFilters,
  createDefaultOfferFilters,
  DEFAULT_PRICE_RANGE,
  normalizeOfferFilters,
  OfferFilters,
  OfferFilterSortBy,
} from './offer-filter-modal.models';

type QuickFilterId = 'pickupToday' | 'availableNow' | 'nearMe' | 'bestDiscount';
type FilterSectionId = 'discount' | 'availability' | 'allergens' | 'sort';

interface QuickFilterOption {
  id: QuickFilterId;
  label: string;
  icon: keyof typeof appIcons;
}

@Component({
  selector: 'app-offer-filter-modal',
  imports: [FontAwesomeModule],
  templateUrl: './offer-filter-modal.component.html',
  styleUrl: './offer-filter-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferFilterModalComponent {
  readonly isOpen = input(false);
  readonly resultCount = input(24);
  readonly filters = input<OfferFilters>(createDefaultOfferFilters());
  readonly locationOptions = input<readonly string[]>([]);
  readonly currentLocationLabel = input('Current location');
  readonly close = output<void>();
  readonly applyFilters = output<OfferFilters>();
  readonly clearFilters = output<void>();
  readonly draftFiltersChange = output<OfferFilters>();

  protected readonly icons = appIcons;
  protected readonly quickFilterOptions: readonly QuickFilterOption[] = [
    { id: 'pickupToday', label: 'Pickup today', icon: 'calendarDays' },
    { id: 'availableNow', label: 'Available now', icon: 'clock' },
    { id: 'nearMe', label: 'Near me', icon: 'locationDot' },
    { id: 'bestDiscount', label: 'Best discount', icon: 'wandMagicSparkles' },
  ] as const;
  protected readonly distanceOptions = RADIUS_PRESET_OPTIONS;
  protected readonly categoryOptions = OFFER_CATEGORY_OPTIONS;
  protected readonly allergenOptions = ALLERGEN_OPTIONS.filter((option) => option.value !== 'UNKNOWN');
  protected readonly quantityOptions = [
    { value: 'any', label: 'Any' },
    { value: 'one', label: '1 left' },
    { value: 'twoThree', label: '2 - 3 left' },
    { value: 'fourPlus', label: '4+ left' },
  ] as const;
  protected readonly discountOptions = [
    { value: '30', label: '30%+' },
    { value: '50', label: '50%+' },
    { value: '70', label: '70%+' },
  ] as const;
  protected readonly pricePresetOptions = [
    { value: 'under5', label: 'Under EUR5' },
    { value: '5to8', label: 'EUR5 - EUR8' },
    { value: '8to12', label: 'EUR8 - EUR12' },
    { value: '12plus', label: 'EUR12+' },
  ] as const;
  protected readonly sortOptions: readonly { value: OfferFilterSortBy; label: string }[] = [
    { value: 'nearest', label: 'Nearest' },
    { value: 'pickupSoonest', label: 'Pickup soonest' },
    { value: 'lowestPrice', label: 'Lowest price' },
    { value: 'highestDiscount', label: 'Highest discount' },
    { value: 'bestRated', label: 'Best rated' },
    { value: 'newest', label: 'Newest' },
  ] as const;
  protected readonly draftFilters = signal<OfferFilters>(createDefaultOfferFilters());
  protected readonly openAdvancedSections = signal<FilterSectionId[]>([]);
  protected readonly canShowLocationSelect = computed(() => this.locationOptions().length > 0);
  protected readonly resolvedLocationOptions = computed(() => {
    const options = new Set<string>();
    const currentLocation = this.currentLocationLabel().trim();
    if (currentLocation) {
      options.add(currentLocation);
    }
    for (const option of this.locationOptions()) {
      if (option.trim()) {
        options.add(option.trim());
      }
    }
    return Array.from(options);
  });
  protected readonly priceRangeStart = computed(() =>
    ((this.draftFilters().priceMin - DEFAULT_PRICE_RANGE.min) / (DEFAULT_PRICE_RANGE.max - DEFAULT_PRICE_RANGE.min)) * 100,
  );
  protected readonly priceRangeEnd = computed(() =>
    ((this.draftFilters().priceMax - DEFAULT_PRICE_RANGE.min) / (DEFAULT_PRICE_RANGE.max - DEFAULT_PRICE_RANGE.min)) * 100,
  );
  protected readonly resultCountLabel = computed(() => {
    const count = this.resultCount();
    return `${count} ${count === 1 ? 'offer' : 'offers'}`;
  });
  protected readonly showOffersLabel = computed(() => {
    const count = this.resultCount();
    const noun = count === 1 ? 'offer' : 'offers';
    return `Show ${count} ${noun}`;
  });

  constructor() {
    effect(() => {
      if (!this.isOpen()) {
        return;
      }

      const nextDraftFilters = cloneOfferFilters(this.filters());
      this.draftFilters.set(nextDraftFilters);
      this.openAdvancedSections.set(this.resolveInitialOpenSections(nextDraftFilters));
    });

    effect(() => {
      if (!this.isOpen()) {
        return;
      }

      this.draftFiltersChange.emit(normalizeOfferFilters(this.draftFilters()));
    });
  }

  protected handleBackdropClick(event: MouseEvent): void {
    if (event.target !== event.currentTarget) {
      return;
    }

    this.close.emit();
  }

  protected handleApply(): void {
    this.applyFilters.emit(normalizeOfferFilters(this.draftFilters()));
  }

  protected handleClear(): void {
    const nextFilters = createDefaultOfferFilters();
    this.draftFilters.set(nextFilters);
    this.clearFilters.emit();
  }

  protected updateLocation(value: string): void {
    this.patchDraft({ location: value });
  }

  protected updateDistance(value: number | string): void {
    const numericValue = typeof value === 'number' ? value : Number.parseInt(value, 10);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    this.patchDraft({ distanceKm: Math.max(1, Math.round(numericValue)) });
  }

  protected setPickupDay(value: OfferFilters['pickupDay']): void {
    const nextDate = value === 'custom' ? this.draftFilters().pickupDate || this.buildTodayIsoDate() : null;
    this.patchDraft({
      pickupDay: value,
      pickupDate: nextDate,
    });
    this.syncQuickFilter('pickupToday', value === 'today');
  }

  protected updatePickupDate(value: string): void {
    this.patchDraft({ pickupDate: value || null });
  }

  protected updatePickupWindow(value: OfferFilters['pickupWindow']): void {
    this.patchDraft({ pickupWindow: value });
  }

  protected updatePickupTime(field: 'pickupFrom' | 'pickupTo', value: string): void {
    this.patchDraft({ [field]: value || null } as Partial<OfferFilters>);
  }

  protected toggleQuickFilter(filterId: QuickFilterId): void {
    this.draftFilters.update((currentFilters) => {
      const nextFilters = cloneOfferFilters(currentFilters);
      const isActive = nextFilters.quickFilters.includes(filterId);
      nextFilters.quickFilters = isActive
        ? nextFilters.quickFilters.filter((value) => value !== filterId)
        : [...nextFilters.quickFilters, filterId];

      if (filterId === 'pickupToday') {
        nextFilters.pickupDay = isActive ? 'any' : 'today';
      }

      if (filterId === 'nearMe') {
        nextFilters.location = isActive ? '' : this.currentLocationLabel();
      }

      if (filterId === 'bestDiscount') {
        nextFilters.discountPreset = isActive ? 'any' : '50';
      }

      return nextFilters;
    });
  }

  protected toggleCategory(value: string): void {
    this.draftFilters.update((currentFilters) => ({
      ...currentFilters,
      categories: this.toggleStringSelection(currentFilters.categories, value),
    }));
  }

  protected setPricePreset(value: string): void {
    const nextValue = value as OfferFilters['pricePreset'];
    const range = this.resolvePriceRangeFromPreset(nextValue);
    this.patchDraft({
      pricePreset: nextValue,
      priceMin: range.min,
      priceMax: range.max,
    });
  }

  protected updatePriceMin(value: string): void {
    const numericValue = Number.parseInt(value, 10);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    this.draftFilters.update((currentFilters) => ({
      ...currentFilters,
      pricePreset: 'any',
      priceMin: Math.min(numericValue, currentFilters.priceMax),
    }));
  }

  protected updatePriceMax(value: string): void {
    const numericValue = Number.parseInt(value, 10);
    if (!Number.isFinite(numericValue)) {
      return;
    }

    this.draftFilters.update((currentFilters) => ({
      ...currentFilters,
      pricePreset: 'any',
      priceMax: Math.max(numericValue, currentFilters.priceMin),
    }));
  }

  protected updatePriceRangeFromTrack(event: MouseEvent): void {
    const track = event.currentTarget as HTMLDivElement | null;
    if (!track) {
      return;
    }

    const bounds = track.getBoundingClientRect();
    if (bounds.width <= 0) {
      return;
    }

    const offset = Math.min(bounds.width, Math.max(0, event.clientX - bounds.left));
    const ratio = offset / bounds.width;
    const nextValue = Math.round(
      DEFAULT_PRICE_RANGE.min + ratio * (DEFAULT_PRICE_RANGE.max - DEFAULT_PRICE_RANGE.min),
    );
    const { priceMin, priceMax } = this.draftFilters();

    if (Math.abs(nextValue - priceMin) <= Math.abs(nextValue - priceMax)) {
      this.updatePriceMin(nextValue.toString());
      return;
    }

    this.updatePriceMax(nextValue.toString());
  }

  protected setDiscountPreset(value: string): void {
    this.patchDraft({ discountPreset: value as OfferFilters['discountPreset'] });
  }

  protected toggleHideSoldOut(): void {
    this.patchDraft({ hideSoldOut: !this.draftFilters().hideSoldOut });
  }

  protected setQuantityLeft(value: OfferFilters['quantityLeft']): void {
    this.patchDraft({ quantityLeft: value });
  }

  protected toggleAllergen(value: string): void {
    this.draftFilters.update((currentFilters) => ({
      ...currentFilters,
      excludedAllergens: this.toggleStringSelection(currentFilters.excludedAllergens, value),
    }));
  }

  protected toggleExcludeMayContain(): void {
    this.patchDraft({ excludeMayContain: !this.draftFilters().excludeMayContain });
  }

  protected updateSort(value: string): void {
    this.patchDraft({ sortBy: value as OfferFilterSortBy });
  }

  protected toggleAdvancedSection(sectionId: FilterSectionId): void {
    this.openAdvancedSections.update((currentSections) =>
      currentSections.includes(sectionId)
        ? currentSections.filter((currentSection) => currentSection !== sectionId)
        : [...currentSections, sectionId],
    );
  }

  protected isQuickFilterActive(value: QuickFilterId): boolean {
    return this.draftFilters().quickFilters.includes(value);
  }

  protected isCategorySelected(value: string): boolean {
    return this.draftFilters().categories.includes(value);
  }

  protected isAllergenSelected(value: string): boolean {
    return this.draftFilters().excludedAllergens.includes(value);
  }

  protected isDistanceSelected(value: number): boolean {
    return this.draftFilters().distanceKm === value;
  }

  protected isPricePresetSelected(value: OfferFilters['pricePreset']): boolean {
    return this.draftFilters().pricePreset === value;
  }

  protected isDiscountPresetSelected(value: OfferFilters['discountPreset']): boolean {
    return this.draftFilters().discountPreset === value;
  }

  protected isQuantitySelected(value: OfferFilters['quantityLeft']): boolean {
    return this.draftFilters().quantityLeft === value;
  }

  protected isAdvancedSectionOpen(sectionId: FilterSectionId): boolean {
    return this.openAdvancedSections().includes(sectionId);
  }

  protected formatCurrency(value: number): string {
    return `EUR${value}`;
  }

  protected formatPriceMaxLabel(): string {
    const priceMax = this.draftFilters().priceMax;
    return priceMax >= DEFAULT_PRICE_RANGE.max ? `${this.formatCurrency(priceMax)}+` : this.formatCurrency(priceMax);
  }

  protected advancedSectionSummary(sectionId: FilterSectionId): string {
    const filters = this.draftFilters();

    switch (sectionId) {
      case 'discount':
        return filters.discountPreset === 'any' ? 'Any discount' : `${filters.discountPreset}% and up`;
      case 'availability':
        if (filters.hideSoldOut) {
          return filters.quantityLeft === 'any' ? 'Only available offers' : 'Availability narrowed';
        }
        switch (filters.quantityLeft) {
          case 'one':
            return '1 left';
          case 'twoThree':
            return '2-3 left';
          case 'fourPlus':
            return '4+ left';
          default:
            return 'Any quantity';
        }
      case 'allergens':
        if (!filters.excludedAllergens.length) {
          return 'No exclusions';
        }

        return filters.excludeMayContain
          ? `${filters.excludedAllergens.length} exclusions incl. traces`
          : `${filters.excludedAllergens.length} exclusions`;
      case 'sort':
        return this.sortOptions.find((option) => option.value === filters.sortBy)?.label ?? 'Nearest';
    }
  }

  private patchDraft(patch: Partial<OfferFilters>): void {
    this.draftFilters.update((currentFilters) => ({
      ...currentFilters,
      ...patch,
    }));
  }

  private buildTodayIsoDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private resolvePriceRangeFromPreset(value: OfferFilters['pricePreset']): { min: number; max: number } {
    switch (value) {
      case 'under5':
        return { min: 0, max: 5 };
      case '5to8':
        return { min: 5, max: 8 };
      case '8to12':
        return { min: 8, max: 12 };
      case '12plus':
        return { min: 12, max: DEFAULT_PRICE_RANGE.max };
      default:
        return { min: DEFAULT_PRICE_RANGE.min, max: DEFAULT_PRICE_RANGE.max };
    }
  }

  private syncQuickFilter(filterId: QuickFilterId, shouldEnable: boolean): void {
    this.draftFilters.update((currentFilters) => ({
      ...currentFilters,
      quickFilters: this.syncStringFlag(currentFilters.quickFilters, filterId, shouldEnable),
    }));
  }

  private syncStringFlag(values: string[], value: string, shouldEnable: boolean): string[] {
    return shouldEnable
      ? this.toggleStringSelection(values, value, true)
      : this.toggleStringSelection(values, value, false);
  }

  private resolveInitialOpenSections(filters: OfferFilters): FilterSectionId[] {
    const sections: FilterSectionId[] = [];

    if (filters.discountPreset !== 'any' || filters.quickFilters.includes('bestDiscount')) {
      sections.push('discount');
    }

    if (filters.hideSoldOut || filters.quantityLeft !== 'any') {
      sections.push('availability');
    }

    if (filters.excludedAllergens.length || filters.excludeMayContain) {
      sections.push('allergens');
    }

    if (filters.sortBy !== 'nearest') {
      sections.push('sort');
    }

    return sections;
  }

  private toggleStringSelection(values: string[], value: string, force?: boolean): string[] {
    const hasValue = values.includes(value);
    if ((force ?? !hasValue) === hasValue) {
      return [...values];
    }

    if (force ?? !hasValue) {
      return [...values, value];
    }

    return values.filter((entry) => entry !== value);
  }
}
