import {
  MANAGED_QUERY_PARAMS,
  MarketplaceUrlState,
} from './browse-offers.models';
import {
  cloneOfferFilters,
  createDefaultOfferFilters,
  normalizeOfferFilters,
  OfferFilters,
} from './components/offer-filter-modal/offer-filter-modal.models';
import {
  MarketplaceOfferSort,
  MarketplaceViewMode,
} from '../../models/marketplace-offer.model';
import { ALLERGEN_OPTIONS, OFFER_CATEGORY_OPTIONS } from '../../models/offer.model';
import { resolveCurrentSortBy } from './browse-offers-filter.utils';

interface BuildBrowseOffersQueryParamsOptions {
  currentQueryParams: Record<string, unknown>;
  searchText: string;
  sort: string;
  includeUnavailable: boolean;
  viewMode: string;
  selectedCity: string | null;
  radiusKm: number;
  filters: OfferFilters;
}

const CATEGORY_CODES = OFFER_CATEGORY_OPTIONS.map((option) => option.value);
const CATEGORY_CODE_INDEX = new Map(CATEGORY_CODES.map((value, index) => [value, index]));
const ALLERGEN_CODES = ALLERGEN_OPTIONS.map((option) => option.value);
const ALLERGEN_CODE_INDEX = new Map(ALLERGEN_CODES.map((value, index) => [value, index]));

const PICKUP_DAY_CODES = {
  today: '1',
  tomorrow: '2',
  custom: '3',
} as const;
const PICKUP_DAY_VALUES = {
  '1': 'today',
  '2': 'tomorrow',
  '3': 'custom',
} as const;
const PICKUP_WINDOW_CODES = {
  morning: '1',
  afternoon: '2',
  evening: '3',
} as const;
const PICKUP_WINDOW_VALUES = {
  '1': 'morning',
  '2': 'afternoon',
  '3': 'evening',
} as const;
const PRICE_PRESET_CODES = {
  under5: '1',
  '5to8': '2',
  '8to12': '3',
  '12plus': '4',
} as const;
const PRICE_PRESET_VALUES = {
  '1': 'under5',
  '2': '5to8',
  '3': '8to12',
  '4': '12plus',
} as const;
const DISCOUNT_PRESET_CODES = {
  '30': '1',
  '50': '2',
  '70': '3',
} as const;
const DISCOUNT_PRESET_VALUES = {
  '1': '30',
  '2': '50',
  '3': '70',
} as const;
const QUANTITY_LEFT_CODES = {
  one: '1',
  twoThree: '2',
  fourPlus: '3',
} as const;
const QUANTITY_LEFT_VALUES = {
  '1': 'one',
  '2': 'twoThree',
  '3': 'fourPlus',
} as const;
const SORT_BY_CODES = {
  pickupSoonest: '1',
  lowestPrice: '2',
  highestDiscount: '3',
  bestRated: '4',
  newest: '5',
} as const;
const SORT_BY_VALUES = {
  '1': 'pickupSoonest',
  '2': 'lowestPrice',
  '3': 'highestDiscount',
  '4': 'bestRated',
  '5': 'newest',
} as const;

function encodeMask(values: readonly string[], indexMap: Map<string, number>): string | null {
  let mask = 0;

  for (const value of values) {
    const index = indexMap.get(value);
    if (index === undefined) {
      continue;
    }

    mask |= 1 << index;
  }

  return mask > 0 ? mask.toString(36) : null;
}

function decodeMask<TValue extends string>(
  value: string,
  orderedValues: readonly TValue[],
): TValue[] {
  const mask = Number.parseInt(value, 36);
  if (!Number.isFinite(mask) || mask <= 0) {
    return [];
  }

  return orderedValues.filter((_, index) => (mask & (1 << index)) !== 0);
}

function encodeDateValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(value);
  if (!match?.groups) {
    return null;
  }

  return `${match.groups['year']}${match.groups['month']}${match.groups['day']}`;
}

function decodeDateValue(value: string): string | null {
  if (!/^\d{8}$/.test(value)) {
    return null;
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function encodeTimeValue(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const match = /^(?<hours>\d{2}):(?<minutes>\d{2})$/.exec(value);
  if (!match?.groups) {
    return null;
  }

  return `${match.groups['hours']}${match.groups['minutes']}`;
}

function decodeTimeValue(value: string): string | null {
  if (!/^\d{4}$/.test(value)) {
    return null;
  }

  return `${value.slice(0, 2)}:${value.slice(2, 4)}`;
}

function prefixEncodedValue(prefix: string, value: string | null): string | null {
  return value ? `${prefix}${value}` : null;
}

function resolvePresetPriceRange(
  value: OfferFilters['pricePreset'],
): { min: number; max: number } {
  switch (value) {
    case 'under5':
      return { min: 0, max: 5 };
    case '5to8':
      return { min: 5, max: 8 };
    case '8to12':
      return { min: 8, max: 12 };
    case '12plus':
      return { min: 12, max: 20 };
    default:
      return { min: 0, max: 20 };
  }
}

function compactOfferFiltersForUrl(
  filters: OfferFilters,
  sort: MarketplaceOfferSort,
): OfferFilters {
  const normalizedFilters = normalizeOfferFilters(filters);
  const defaultFilters = createDefaultOfferFilters();
  const defaultSortBy = resolveCurrentSortBy(defaultFilters.sortBy, sort);
  const quickFilters = normalizedFilters.quickFilters.filter(
    (quickFilter) => quickFilter === 'availableNow',
  );

  return {
    ...cloneOfferFilters(defaultFilters),
    ...(quickFilters.length ? { quickFilters } : {}),
    ...(normalizedFilters.pickupDay !== defaultFilters.pickupDay
      ? { pickupDay: normalizedFilters.pickupDay }
      : {}),
    ...(normalizedFilters.pickupDate ? { pickupDate: normalizedFilters.pickupDate } : {}),
    ...(normalizedFilters.pickupWindow !== defaultFilters.pickupWindow
      ? { pickupWindow: normalizedFilters.pickupWindow }
      : {}),
    ...(normalizedFilters.pickupFrom ? { pickupFrom: normalizedFilters.pickupFrom } : {}),
    ...(normalizedFilters.pickupTo ? { pickupTo: normalizedFilters.pickupTo } : {}),
    ...(normalizedFilters.categories.length
      ? { categories: [...normalizedFilters.categories].sort() }
      : {}),
    ...(normalizedFilters.pricePreset !== defaultFilters.pricePreset
      ? { pricePreset: normalizedFilters.pricePreset }
      : {}),
    ...(normalizedFilters.pricePreset !== defaultFilters.pricePreset
      ? resolvePresetPriceRange(normalizedFilters.pricePreset)
      : {}),
    ...(normalizedFilters.discountPreset !== defaultFilters.discountPreset
      ? { discountPreset: normalizedFilters.discountPreset }
      : {}),
    ...(normalizedFilters.quantityLeft !== defaultFilters.quantityLeft
      ? { quantityLeft: normalizedFilters.quantityLeft }
      : {}),
    ...(normalizedFilters.dietary.length
      ? { dietary: [...normalizedFilters.dietary].sort() }
      : {}),
    ...(normalizedFilters.excludedAllergens.length
      ? { excludedAllergens: [...normalizedFilters.excludedAllergens].sort() }
      : {}),
    ...(normalizedFilters.excludeMayContain ? { excludeMayContain: true } : {}),
    ...(normalizedFilters.sortBy !== defaultSortBy ? { sortBy: normalizedFilters.sortBy } : {}),
    ...(normalizedFilters.pricePreset === defaultFilters.pricePreset &&
    (normalizedFilters.priceMin !== defaultFilters.priceMin ||
      normalizedFilters.priceMax !== defaultFilters.priceMax)
      ? {
          priceMin: normalizedFilters.priceMin,
          priceMax: normalizedFilters.priceMax,
        }
      : {}),
    ...(normalizedFilters.pricePreset !== defaultFilters.pricePreset &&
    (normalizedFilters.priceMin !== resolvePresetPriceRange(normalizedFilters.pricePreset).min ||
      normalizedFilters.priceMax !== resolvePresetPriceRange(normalizedFilters.pricePreset).max)
      ? {
          priceMin: normalizedFilters.priceMin,
          priceMax: normalizedFilters.priceMax,
        }
      : {}),
  };
}

export function parseOfferFiltersParam(value: string | null): OfferFilters {
  const defaults = createDefaultOfferFilters();
  if (!value) {
    return defaults;
  }

  const nextFilters = cloneOfferFilters(defaults);
  const segments = value
    .split('~')
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    if (segment === 'an1') {
      nextFilters.quickFilters = ['availableNow'];
      continue;
    }

    if (segment.startsWith('pd')) {
      const nextValue = PICKUP_DAY_VALUES[segment.slice(2) as keyof typeof PICKUP_DAY_VALUES];
      if (nextValue) {
        nextFilters.pickupDay = nextValue;
      }
      continue;
    }

    if (segment.startsWith('dt')) {
      nextFilters.pickupDate = decodeDateValue(segment.slice(2));
      continue;
    }

    if (segment.startsWith('pw')) {
      const nextValue =
        PICKUP_WINDOW_VALUES[segment.slice(2) as keyof typeof PICKUP_WINDOW_VALUES];
      if (nextValue) {
        nextFilters.pickupWindow = nextValue;
      }
      continue;
    }

    if (segment.startsWith('pf')) {
      nextFilters.pickupFrom = decodeTimeValue(segment.slice(2));
      continue;
    }

    if (segment.startsWith('pt')) {
      nextFilters.pickupTo = decodeTimeValue(segment.slice(2));
      continue;
    }

    if (segment.startsWith('cg')) {
      nextFilters.categories = decodeMask(segment.slice(2), CATEGORY_CODES);
      continue;
    }

    if (segment.startsWith('pp')) {
      const nextValue = PRICE_PRESET_VALUES[segment.slice(2) as keyof typeof PRICE_PRESET_VALUES];
      if (nextValue) {
        nextFilters.pricePreset = nextValue;
        const range = resolvePresetPriceRange(nextValue);
        nextFilters.priceMin = range.min;
        nextFilters.priceMax = range.max;
      }
      continue;
    }

    if (segment.startsWith('pr')) {
      const match = /^(?<min>\d+)-(?<max>\d+)$/.exec(segment.slice(2));
      const min = match?.groups ? Number.parseInt(match.groups['min'], 10) : Number.NaN;
      const max = match?.groups ? Number.parseInt(match.groups['max'], 10) : Number.NaN;
      if (Number.isFinite(min) && Number.isFinite(max)) {
        nextFilters.priceMin = min;
        nextFilters.priceMax = max;
        if (segment.startsWith('pr')) {
          nextFilters.pricePreset = 'any';
        }
      }
      continue;
    }

    if (segment.startsWith('dp')) {
      const nextValue =
        DISCOUNT_PRESET_VALUES[segment.slice(2) as keyof typeof DISCOUNT_PRESET_VALUES];
      if (nextValue) {
        nextFilters.discountPreset = nextValue;
      }
      continue;
    }

    if (segment.startsWith('ql')) {
      const nextValue =
        QUANTITY_LEFT_VALUES[segment.slice(2) as keyof typeof QUANTITY_LEFT_VALUES];
      if (nextValue) {
        nextFilters.quantityLeft = nextValue;
      }
      continue;
    }

    if (segment.startsWith('al')) {
      nextFilters.excludedAllergens = decodeMask(segment.slice(2), ALLERGEN_CODES);
      continue;
    }

    if (segment === 'mc1') {
      nextFilters.excludeMayContain = true;
      continue;
    }

    if (segment.startsWith('sb')) {
      const nextValue = SORT_BY_VALUES[segment.slice(2) as keyof typeof SORT_BY_VALUES];
      if (nextValue) {
        nextFilters.sortBy = nextValue;
      }
    }
  }

  return normalizeOfferFilters(nextFilters);
}

export function serializeOfferFiltersParam(
  filters: OfferFilters,
  sort: MarketplaceOfferSort,
): string | null {
  const compactFilters = compactOfferFiltersForUrl(filters, sort);
  const defaultFilters = createDefaultOfferFilters();
  const defaultSortBy = resolveCurrentSortBy(defaultFilters.sortBy, sort);
  const priceRangeBaseline =
    compactFilters.pricePreset !== defaultFilters.pricePreset
      ? resolvePresetPriceRange(compactFilters.pricePreset)
      : {
          min: defaultFilters.priceMin,
          max: defaultFilters.priceMax,
        };
  const segments = [
    compactFilters.quickFilters.includes('availableNow') ? 'an1' : null,
    compactFilters.pickupDay !== defaultFilters.pickupDay
      ? `pd${PICKUP_DAY_CODES[compactFilters.pickupDay as keyof typeof PICKUP_DAY_CODES]}`
      : null,
    prefixEncodedValue('dt', encodeDateValue(compactFilters.pickupDate)),
    compactFilters.pickupWindow !== defaultFilters.pickupWindow
      ? `pw${PICKUP_WINDOW_CODES[compactFilters.pickupWindow as keyof typeof PICKUP_WINDOW_CODES]}`
      : null,
    prefixEncodedValue('pf', encodeTimeValue(compactFilters.pickupFrom)),
    prefixEncodedValue('pt', encodeTimeValue(compactFilters.pickupTo)),
    compactFilters.categories.length
      ? `cg${encodeMask(compactFilters.categories, CATEGORY_CODE_INDEX)}`
      : null,
    compactFilters.pricePreset !== defaultFilters.pricePreset
      ? `pp${PRICE_PRESET_CODES[compactFilters.pricePreset as keyof typeof PRICE_PRESET_CODES]}`
      : null,
    compactFilters.priceMin !== priceRangeBaseline.min ||
    compactFilters.priceMax !== priceRangeBaseline.max
      ? `pr${compactFilters.priceMin}-${compactFilters.priceMax}`
      : null,
    compactFilters.discountPreset !== defaultFilters.discountPreset
      ? `dp${DISCOUNT_PRESET_CODES[compactFilters.discountPreset as keyof typeof DISCOUNT_PRESET_CODES]}`
      : null,
    compactFilters.quantityLeft !== defaultFilters.quantityLeft
      ? `ql${QUANTITY_LEFT_CODES[compactFilters.quantityLeft as keyof typeof QUANTITY_LEFT_CODES]}`
      : null,
    compactFilters.excludedAllergens.length
      ? `al${encodeMask(compactFilters.excludedAllergens, ALLERGEN_CODE_INDEX)}`
      : null,
    compactFilters.excludeMayContain ? 'mc1' : null,
    compactFilters.sortBy !== defaultSortBy
      ? `sb${SORT_BY_CODES[compactFilters.sortBy as keyof typeof SORT_BY_CODES]}`
      : null,
  ].filter((segment): segment is string => Boolean(segment));

  return segments.length ? segments.join('~') : null;
}

function stableSerializeOfferFilters(
  filters: OfferFilters,
  sort: MarketplaceOfferSort,
): string {
  return serializeOfferFiltersParam(filters, sort) ?? '';
}

export function buildBrowseOffersQueryParams(
  options: BuildBrowseOffersQueryParamsOptions,
): Record<string, unknown> {
  const nextQueryParams: Record<string, string> = {};
  const searchText = options.searchText.trim();

  if (searchText) {
    nextQueryParams['q'] = searchText;
  }

  nextQueryParams['sort'] = options.sort;

  nextQueryParams['includeUnavailable'] = String(options.includeUnavailable);

  nextQueryParams['view'] = options.viewMode;

  if (options.selectedCity) {
    nextQueryParams['city'] = options.selectedCity;
  }

  nextQueryParams['radiusKm'] = String(options.radiusKm);

  const serializedFilters = serializeOfferFiltersParam(
    options.filters,
    options.sort as MarketplaceOfferSort,
  );
  if (serializedFilters) {
    nextQueryParams['filters'] = serializedFilters;
  }

  const preservedQueryParams = { ...options.currentQueryParams };
  for (const managedQueryParam of MANAGED_QUERY_PARAMS) {
    delete preservedQueryParams[managedQueryParam];
  }

  return {
    ...preservedQueryParams,
    ...nextQueryParams,
  };
}

export function haveSameQueryParams(
  currentQueryParams: Record<string, unknown>,
  nextQueryParams: Record<string, unknown>,
): boolean {
  const currentEntries = Object.entries(currentQueryParams).sort(([firstKey], [secondKey]) =>
    firstKey.localeCompare(secondKey),
  );
  const nextEntries = Object.entries(nextQueryParams).sort(([firstKey], [secondKey]) =>
    firstKey.localeCompare(secondKey),
  );

  return JSON.stringify(currentEntries) === JSON.stringify(nextEntries);
}

interface BrowseOffersUrlStateOutcome {
  changed: boolean;
  requiresReload: boolean;
}

export interface BrowseOffersUrlSnapshot {
  query: string;
  sort: MarketplaceOfferSort;
  includeUnavailable: boolean;
  view: MarketplaceViewMode;
  city: string | null;
  radiusKm: number;
  filters: OfferFilters;
}

interface BrowseOffersUrlStateTransition {
  nextState: BrowseOffersUrlSnapshot;
  outcome: BrowseOffersUrlStateOutcome;
  shouldClearSearchDebounce: boolean;
  shouldExitFullMap: boolean;
}

export function applyBrowseOffersUrlState(
  currentState: BrowseOffersUrlSnapshot,
  nextState: MarketplaceUrlState,
): BrowseOffersUrlStateOutcome {
  const searchChanged = currentState.query !== nextState.query;
  const sortChanged = currentState.sort !== nextState.sort;
  const includeUnavailableChanged =
    currentState.includeUnavailable !== nextState.includeUnavailable;
  const viewChanged = currentState.view !== nextState.view;
  const cityChanged = currentState.city !== nextState.city;
  const radiusChanged = currentState.radiusKm !== nextState.radiusKm;
  const filtersChanged =
    stableSerializeOfferFilters(currentState.filters, currentState.sort) !==
    stableSerializeOfferFilters(nextState.filters, nextState.sort);

  return {
    changed:
      searchChanged ||
      sortChanged ||
      includeUnavailableChanged ||
      viewChanged ||
      cityChanged ||
      radiusChanged ||
      filtersChanged,
    requiresReload:
      searchChanged ||
      sortChanged ||
      includeUnavailableChanged ||
      cityChanged ||
      radiusChanged,
  };
}

export function resolveBrowseOffersUrlStateTransition(
  currentState: BrowseOffersUrlSnapshot,
  nextState: MarketplaceUrlState,
  hasPendingSearchDebounce: boolean,
): BrowseOffersUrlStateTransition {
  return {
    nextState: {
      query: nextState.query,
      sort: nextState.sort,
      includeUnavailable: nextState.includeUnavailable,
      view: nextState.view,
      city: nextState.city,
      radiusKm: nextState.radiusKm,
      filters: nextState.filters,
    },
    outcome: applyBrowseOffersUrlState(currentState, nextState),
    shouldClearSearchDebounce: hasPendingSearchDebounce && currentState.query !== nextState.query,
    shouldExitFullMap: currentState.view !== nextState.view && nextState.view !== 'MAP',
  };
}
