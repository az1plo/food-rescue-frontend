import {
  DEFAULT_PRICE_RANGE,
  normalizeOfferFilters,
  OfferFilters,
  OfferFilterSortBy,
} from './components/offer-filter-modal/offer-filter-modal.models';
import { MarketplaceOfferModel, MarketplaceOfferSort } from '../../models/marketplace-offer.model';
import { AllergenCode } from '../../models/offer.model';
import {
  MapReferencePoint,
  MapScopeOption,
  ViewerLocation,
} from './browse-offers.models';
import {
  isSameCalendarDay,
  parseTimeValueToMinutes,
  resolveDistanceMeters,
  resolveOfferDiscountPercentage,
  resolveOfferPickupDate,
} from './utils/browse-offers.utils';

interface BrowseOffersFilterContext {
  offers: readonly MarketplaceOfferModel[];
  selectedBusinessId: number | null;
  viewerLocation: ViewerLocation | null;
  currentLocationOptionLabel: string;
  cityOptions: readonly MapScopeOption[];
  resolveOfferDistanceMeters: (offer: MarketplaceOfferModel) => number | null;
}

function resolveReferencePointForFilters(
  filters: OfferFilters,
  viewerLocation: ViewerLocation | null,
  currentLocationOptionLabel: string,
  cityOptions: readonly MapScopeOption[],
): MapReferencePoint | null {
  const normalizedLocation = filters.location.trim();
  if (!normalizedLocation) {
    return null;
  }

  if (normalizedLocation.toLowerCase() === currentLocationOptionLabel.toLowerCase()) {
    return viewerLocation === null
      ? null
      : {
          latitude: viewerLocation.latitude,
          longitude: viewerLocation.longitude,
          label: currentLocationOptionLabel,
        };
  }

  const matchingCity = cityOptions.find(
    (option) => option.city.toLowerCase() === normalizedLocation.toLowerCase(),
  );
  return matchingCity === undefined
    ? null
    : {
        latitude: matchingCity.latitude,
        longitude: matchingCity.longitude,
        label: matchingCity.city,
      };
}

function matchesPickupDayFilter(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
  const pickupFrom = resolveOfferPickupDate(offer);
  if (pickupFrom === null) {
    return false;
  }

  if (filters.pickupDay === 'today') {
    return isSameCalendarDay(pickupFrom, new Date());
  }

  if (filters.pickupDay === 'tomorrow') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isSameCalendarDay(pickupFrom, tomorrow);
  }

  if (filters.pickupDay === 'custom') {
    if (!filters.pickupDate) {
      return false;
    }

    return pickupFrom.toISOString().slice(0, 10) === filters.pickupDate;
  }

  return true;
}

function matchesPickupWindowFilter(
  offer: MarketplaceOfferModel,
  pickupWindow: OfferFilters['pickupWindow'],
): boolean {
  const pickupFrom = resolveOfferPickupDate(offer);
  if (pickupFrom === null) {
    return false;
  }

  const pickupHour = pickupFrom.getHours();
  switch (pickupWindow) {
    case 'morning':
      return pickupHour >= 5 && pickupHour < 12;
    case 'afternoon':
      return pickupHour >= 12 && pickupHour < 17;
    case 'evening':
      return pickupHour >= 17 || pickupHour < 5;
    default:
      return true;
  }
}

function matchesCustomPickupTimeFilter(
  offer: MarketplaceOfferModel,
  filters: OfferFilters,
): boolean {
  const pickupFrom = resolveOfferPickupDate(offer);
  if (pickupFrom === null) {
    return false;
  }

  const pickupMinutes = pickupFrom.getHours() * 60 + pickupFrom.getMinutes();
  const minMinutes = parseTimeValueToMinutes(filters.pickupFrom);
  const maxMinutes = parseTimeValueToMinutes(filters.pickupTo);

  if (minMinutes !== null && pickupMinutes < minMinutes) {
    return false;
  }

  if (maxMinutes !== null && pickupMinutes > maxMinutes) {
    return false;
  }

  return true;
}

function matchesPriceConstraints(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
  if (offer.price < filters.priceMin || offer.price > filters.priceMax) {
    return false;
  }

  switch (filters.pricePreset) {
    case 'under5':
      return offer.price < 5;
    case '5to8':
      return offer.price >= 5 && offer.price <= 8;
    case '8to12':
      return offer.price >= 8 && offer.price <= 12;
    case '12plus':
      return offer.price >= 12;
    default:
      return true;
  }
}

function matchesDiscountConstraints(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
  const discountPercentage = resolveOfferDiscountPercentage(offer);
  switch (filters.discountPreset) {
    case '30':
      return discountPercentage >= 30;
    case '50':
      return discountPercentage >= 50;
    case '70':
      return discountPercentage >= 70;
    default:
      return true;
  }
}

function matchesQuantityConstraint(
  quantityAvailable: number,
  quantityLeft: OfferFilters['quantityLeft'],
): boolean {
  switch (quantityLeft) {
    case 'one':
      return quantityAvailable === 1;
    case 'twoThree':
      return quantityAvailable >= 2 && quantityAvailable <= 3;
    case 'fourPlus':
      return quantityAvailable >= 4;
    default:
      return true;
  }
}

function matchesAllergenConstraints(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
  if (!filters.excludedAllergens.length) {
    return true;
  }

  const excludedAllergens = filters.excludedAllergens as AllergenCode[];
  if (excludedAllergens.some((allergen) => offer.containsAllergens.includes(allergen))) {
    return false;
  }

  if (
    filters.excludeMayContain &&
    excludedAllergens.some((allergen) => offer.mayContainAllergens.includes(allergen))
  ) {
    return false;
  }

  return true;
}

function isOfferAvailableNow(offer: MarketplaceOfferModel): boolean {
  if (offer.status !== 'AVAILABLE' || offer.quantityAvailable <= 0) {
    return false;
  }

  const pickupFrom = resolveOfferPickupDate(offer);
  const pickupTo = new Date(offer.pickupTimeWindow.to);
  if (pickupFrom === null || Number.isNaN(pickupTo.getTime())) {
    return false;
  }

  const now = new Date();
  return now >= pickupFrom && now <= pickupTo;
}

function matchesOfferFilters(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
  if (filters.pickupDay !== 'any' && !matchesPickupDayFilter(offer, filters)) {
    return false;
  }

  if (filters.pickupWindow !== 'any' && !matchesPickupWindowFilter(offer, filters.pickupWindow)) {
    return false;
  }

  if ((filters.pickupFrom || filters.pickupTo) && !matchesCustomPickupTimeFilter(offer, filters)) {
    return false;
  }

  if (filters.quickFilters.includes('availableNow') && !isOfferAvailableNow(offer)) {
    return false;
  }

  if (filters.categories.length && !filters.categories.includes(offer.category)) {
    return false;
  }

  if (!matchesPriceConstraints(offer, filters)) {
    return false;
  }

  if (!matchesDiscountConstraints(offer, filters)) {
    return false;
  }

  if (filters.hideSoldOut && (offer.status !== 'AVAILABLE' || offer.quantityAvailable <= 0)) {
    return false;
  }

  if (!matchesQuantityConstraint(offer.quantityAvailable, filters.quantityLeft)) {
    return false;
  }

  if (!matchesAllergenConstraints(offer, filters)) {
    return false;
  }

  return true;
}

function sortVisibleOffers(
  offers: MarketplaceOfferModel[],
  sortBy: OfferFilterSortBy,
  resolveOfferDistance: (offer: MarketplaceOfferModel) => number | null,
): MarketplaceOfferModel[] {
  const sortableOffers = [...offers];
  switch (sortBy) {
    case 'nearest':
      return sortableOffers.sort((first, second) => {
        const firstDistance = resolveOfferDistance(first) ?? Number.POSITIVE_INFINITY;
        const secondDistance = resolveOfferDistance(second) ?? Number.POSITIVE_INFINITY;
        if (firstDistance !== secondDistance) {
          return firstDistance - secondDistance;
        }

        return first.title.localeCompare(second.title);
      });
    case 'pickupSoonest':
      return sortableOffers.sort(
        (first, second) =>
          new Date(first.pickupTimeWindow.from).getTime() -
          new Date(second.pickupTimeWindow.from).getTime(),
      );
    case 'lowestPrice':
      return sortableOffers.sort(
        (first, second) => first.price - second.price || first.title.localeCompare(second.title),
      );
    case 'highestDiscount':
      return sortableOffers.sort(
        (first, second) =>
          resolveOfferDiscountPercentage(second) - resolveOfferDiscountPercentage(first) ||
          first.price - second.price,
      );
    case 'bestRated':
      return sortableOffers.sort(
        (first, second) =>
          (second.business.ratingAverage ?? 0) - (first.business.ratingAverage ?? 0) ||
          second.business.ratingCount - first.business.ratingCount,
      );
    default:
      return sortableOffers;
  }
}

export function computeVisibleOffers(
  filters: OfferFilters,
  context: BrowseOffersFilterContext,
): MarketplaceOfferModel[] {
  const normalizedFilters = normalizeOfferFilters(filters);
  const referencePoint = resolveReferencePointForFilters(
    normalizedFilters,
    context.viewerLocation,
    context.currentLocationOptionLabel,
    context.cityOptions,
  );
  let offers =
    context.selectedBusinessId === null
      ? [...context.offers]
      : context.offers.filter((offer) => offer.business.id === context.selectedBusinessId);

  if (referencePoint !== null) {
    const scopeRadiusMeters = normalizedFilters.distanceKm * 1000;
    offers = offers.filter((offer) => {
      const pickupAddress = offer.pickupLocation.address;
      const distanceMeters = resolveDistanceMeters(
        referencePoint.latitude,
        referencePoint.longitude,
        pickupAddress.latitude ?? offer.business.address.latitude ?? null,
        pickupAddress.longitude ?? offer.business.address.longitude ?? null,
      );
      return distanceMeters !== null && distanceMeters <= scopeRadiusMeters;
    });
  }

  offers = offers.filter((offer) => matchesOfferFilters(offer, normalizedFilters));
  return sortVisibleOffers(offers, normalizedFilters.sortBy, context.resolveOfferDistanceMeters);
}

export function countActiveOfferFilters(filters: OfferFilters): number {
  let count = 0;

  if (
    filters.pickupDay !== 'any' ||
    filters.pickupWindow !== 'any' ||
    Boolean(filters.pickupDate) ||
    Boolean(filters.pickupFrom) ||
    Boolean(filters.pickupTo) ||
    filters.quickFilters.includes('availableNow')
  ) {
    count += 1;
  }

  if (filters.categories.length) {
    count += 1;
  }

  if (
    filters.pricePreset !== 'any' ||
    filters.priceMin !== DEFAULT_PRICE_RANGE.min ||
    filters.priceMax !== DEFAULT_PRICE_RANGE.max
  ) {
    count += 1;
  }

  if (filters.discountPreset !== 'any' || filters.quickFilters.includes('bestDiscount')) {
    count += 1;
  }

  if (filters.hideSoldOut || filters.quantityLeft !== 'any') {
    count += 1;
  }

  if (filters.dietary.length) {
    count += 1;
  }

  if (filters.excludedAllergens.length || filters.excludeMayContain) {
    count += 1;
  }

  return count;
}

export function resolveCurrentSortBy(
  currentSortBy: OfferFilterSortBy,
  marketplaceSort: MarketplaceOfferSort,
): OfferFilterSortBy {
  if (currentSortBy === 'bestRated' || currentSortBy === 'highestDiscount') {
    return currentSortBy;
  }

  switch (marketplaceSort) {
    case 'PICKUP_SOONEST':
      return 'pickupSoonest';
    case 'PRICE_ASC':
      return 'lowestPrice';
    case 'NEWEST':
      return 'newest';
    default:
      return 'nearest';
  }
}

export function resolveMarketplaceSort(sortBy: OfferFilterSortBy): MarketplaceOfferSort {
  switch (sortBy) {
    case 'pickupSoonest':
      return 'PICKUP_SOONEST';
    case 'lowestPrice':
      return 'PRICE_ASC';
    case 'newest':
      return 'NEWEST';
    default:
      return 'DISTANCE';
  }
}
