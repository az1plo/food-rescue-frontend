export type OfferFilterPickupDay = 'any' | 'today' | 'tomorrow' | 'custom';
export type OfferFilterPickupWindow = 'any' | 'morning' | 'afternoon' | 'evening';
export type OfferFilterPricePreset = 'any' | 'under5' | '5to8' | '8to12' | '12plus';
export type OfferFilterDiscountPreset = 'any' | '30' | '50' | '70';
export type OfferFilterQuantityLeft = 'any' | 'one' | 'twoThree' | 'fourPlus';
export type OfferFilterSortBy =
  | 'nearest'
  | 'pickupSoonest'
  | 'lowestPrice'
  | 'highestDiscount'
  | 'bestRated'
  | 'newest';

export interface OfferFilters {
  quickFilters: string[];
  location: string;
  distanceKm: number;
  pickupDay: OfferFilterPickupDay;
  pickupDate?: string | null;
  pickupWindow: OfferFilterPickupWindow;
  pickupFrom?: string | null;
  pickupTo?: string | null;
  categories: string[];
  pricePreset: OfferFilterPricePreset;
  priceMin: number;
  priceMax: number;
  discountPreset: OfferFilterDiscountPreset;
  hideSoldOut: boolean;
  quantityLeft: OfferFilterQuantityLeft;
  dietary: string[];
  excludedAllergens: string[];
  excludeMayContain: boolean;
  sortBy: OfferFilterSortBy;
}

export const DEFAULT_PRICE_RANGE = {
  min: 0,
  max: 20,
} as const;

export const DEFAULT_DISTANCE_KM = 30;
export const MAX_FILTER_DISTANCE_KM = 100;

export const DEFAULT_OFFER_FILTERS: Readonly<OfferFilters> = {
  quickFilters: [],
  location: '',
  distanceKm: DEFAULT_DISTANCE_KM,
  pickupDay: 'any',
  pickupDate: null,
  pickupWindow: 'any',
  pickupFrom: null,
  pickupTo: null,
  categories: [],
  pricePreset: 'any',
  priceMin: DEFAULT_PRICE_RANGE.min,
  priceMax: DEFAULT_PRICE_RANGE.max,
  discountPreset: 'any',
  hideSoldOut: false,
  quantityLeft: 'any',
  dietary: [],
  excludedAllergens: [],
  excludeMayContain: false,
  sortBy: 'nearest',
};

export function cloneOfferFilters(filters: OfferFilters): OfferFilters {
  return {
    ...filters,
    quickFilters: [...filters.quickFilters],
    categories: [...filters.categories],
    dietary: [...filters.dietary],
    excludedAllergens: [...filters.excludedAllergens],
  };
}

export function createDefaultOfferFilters(): OfferFilters {
  return cloneOfferFilters(DEFAULT_OFFER_FILTERS as OfferFilters);
}

export function normalizeOfferFilters(filters: OfferFilters): OfferFilters {
  const normalizedDistanceKm = Number.isFinite(filters.distanceKm)
    ? Math.min(MAX_FILTER_DISTANCE_KM, Math.max(1, Math.round(filters.distanceKm)))
    : DEFAULT_DISTANCE_KM;
  const normalizedPriceMin = Number.isFinite(filters.priceMin)
    ? Math.min(DEFAULT_PRICE_RANGE.max, Math.max(DEFAULT_PRICE_RANGE.min, Math.round(filters.priceMin)))
    : DEFAULT_PRICE_RANGE.min;
  const normalizedPriceMax = Number.isFinite(filters.priceMax)
    ? Math.min(DEFAULT_PRICE_RANGE.max, Math.max(DEFAULT_PRICE_RANGE.min, Math.round(filters.priceMax)))
    : DEFAULT_PRICE_RANGE.max;
  const nextFilters = cloneOfferFilters(filters);

  nextFilters.distanceKm = normalizedDistanceKm;
  nextFilters.priceMin = Math.min(normalizedPriceMin, normalizedPriceMax);
  nextFilters.priceMax = Math.max(normalizedPriceMin, normalizedPriceMax);
  nextFilters.location = nextFilters.location.trim();
  nextFilters.pickupDate = nextFilters.pickupDate?.trim() || null;
  nextFilters.pickupFrom = nextFilters.pickupFrom?.trim() || null;
  nextFilters.pickupTo = nextFilters.pickupTo?.trim() || null;

  return nextFilters;
}
