import { ParamMap } from '@angular/router';
import {
  MarketplaceOfferModel,
  MarketplaceOfferSort,
  MarketplaceViewMode,
} from '../../../models/marketplace-offer.model';
import {
  DEFAULT_RADIUS_KM,
  MapScopeOption,
  MarketplaceBusinessCluster,
  MarketplaceUrlState,
  MAX_RADIUS_KM,
  MIN_RADIUS_KM,
  RADIUS_PRESET_OPTIONS,
  SORT_OPTIONS,
  VIEW_MODES,
} from '../browse-offers.models';
import { parseOfferFiltersParam } from '../browse-offers-url-state.utils';

export function isMarketplaceOfferSort(value: string): value is MarketplaceOfferSort {
  return SORT_OPTIONS.includes(value as MarketplaceOfferSort);
}

export function isMarketplaceViewMode(value: string): value is MarketplaceViewMode {
  return VIEW_MODES.includes(value as MarketplaceViewMode);
}

export function isRadiusPresetOption(value: number): boolean {
  return RADIUS_PRESET_OPTIONS.includes(value as (typeof RADIUS_PRESET_OPTIONS)[number]);
}

export function normalizeRadiusKm(value: string | number | null | undefined): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_RADIUS_KM;
  }

  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(numericValue)));
}

export function normalizeRadiusPresetKm(value: string | number | null | undefined): number {
  const normalizedRadiusKm = normalizeRadiusKm(value);
  return isRadiusPresetOption(normalizedRadiusKm) ? normalizedRadiusKm : DEFAULT_RADIUS_KM;
}

export function parseBooleanParam(value: string | null, defaultValue: boolean): boolean {
  if (value === null) {
    return defaultValue;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes') {
    return true;
  }

  if (normalizedValue === 'false' || normalizedValue === '0' || normalizedValue === 'no') {
    return false;
  }

  return defaultValue;
}

export function resolveDistanceMeters(
  startLatitude: number | null,
  startLongitude: number | null,
  endLatitude: number | null,
  endLongitude: number | null,
): number | null {
  if (
    startLatitude === null ||
    startLongitude === null ||
    endLatitude === null ||
    endLongitude === null
  ) {
    return null;
  }

  const earthRadiusMeters = 6_371_000;
  const startLatitudeRadians = (startLatitude * Math.PI) / 180;
  const endLatitudeRadians = (endLatitude * Math.PI) / 180;
  const latitudeDelta = ((endLatitude - startLatitude) * Math.PI) / 180;
  const longitudeDelta = ((endLongitude - startLongitude) * Math.PI) / 180;

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(startLatitudeRadians) *
      Math.cos(endLatitudeRadians) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c * 10) / 10;
}

export function buildBusinessClusters(
  offers: MarketplaceOfferModel[],
): MarketplaceBusinessCluster[] {
  const clusters = new Map<number, MarketplaceBusinessCluster>();

  for (const offer of offers) {
    const existingCluster = clusters.get(offer.business.id);
    const latitude =
      offer.pickupLocation.address.latitude ?? offer.business.address.latitude ?? null;
    const longitude =
      offer.pickupLocation.address.longitude ?? offer.business.address.longitude ?? null;
    const city =
      offer.pickupLocation.address.city?.trim() || offer.business.address.city?.trim() || null;

    if (existingCluster) {
      existingCluster.offers.push(offer);
      if (existingCluster.distanceMeters === null && offer.distanceMeters !== null) {
        existingCluster.distanceMeters = offer.distanceMeters;
      }
      if (existingCluster.city === null && city !== null) {
        existingCluster.city = city;
      }
      continue;
    }

    clusters.set(offer.business.id, {
      business: offer.business,
      offers: [offer],
      city,
      latitude,
      longitude,
      distanceMeters: offer.distanceMeters,
    });
  }

  return [...clusters.values()].sort((first, second) => {
    const firstDistance = first.distanceMeters ?? Number.POSITIVE_INFINITY;
    const secondDistance = second.distanceMeters ?? Number.POSITIVE_INFINITY;

    if (firstDistance !== secondDistance) {
      return firstDistance - secondDistance;
    }

    return first.business.name.localeCompare(second.business.name);
  });
}

export function buildCityOptions(clusters: MarketplaceBusinessCluster[]): MapScopeOption[] {
  const options = new Map<
    string,
    { latitudeTotal: number; longitudeTotal: number; businessCount: number }
  >();

  for (const cluster of clusters) {
    const city = cluster.city?.trim();
    if (!city || cluster.latitude === null || cluster.longitude === null) {
      continue;
    }

    const existing = options.get(city);
    if (existing) {
      existing.latitudeTotal += cluster.latitude;
      existing.longitudeTotal += cluster.longitude;
      existing.businessCount += 1;
      continue;
    }

    options.set(city, {
      latitudeTotal: cluster.latitude,
      longitudeTotal: cluster.longitude,
      businessCount: 1,
    });
  }

  return [...options.entries()]
    .map(([city, value]) => ({
      city,
      latitude: value.latitudeTotal / value.businessCount,
      longitude: value.longitudeTotal / value.businessCount,
      businessCount: value.businessCount,
    }))
    .sort((first, second) => first.city.localeCompare(second.city));
}

export function readUrlState(queryParams: ParamMap): MarketplaceUrlState {
  return {
    query: queryParams.get('q')?.trim() ?? '',
    sort: isMarketplaceOfferSort(queryParams.get('sort') ?? '')
      ? (queryParams.get('sort') as MarketplaceOfferSort)
      : 'DISTANCE',
    includeUnavailable: parseBooleanParam(queryParams.get('includeUnavailable'), true),
    view: isMarketplaceViewMode(queryParams.get('view') ?? '')
      ? (queryParams.get('view') as MarketplaceViewMode)
      : 'LIST',
    city: queryParams.get('city')?.trim() || null,
    radiusKm: normalizeRadiusPresetKm(queryParams.get('radiusKm')),
    filters: parseOfferFiltersParam(queryParams.get('filters')),
  };
}

export function formatPrice(price: number): string {
  return `\u20ac${price.toFixed(2)}`;
}

export function formatOriginalPrice(price: number | null): string {
  return typeof price === 'number' ? `\u20ac${price.toFixed(2)}` : '';
}

export function hasRating(ratingAverage: number | null, ratingCount: number): boolean {
  return ratingAverage !== null && ratingCount > 0;
}

export function formatRating(ratingAverage: number | null, ratingCount: number): string | null {
  if (!hasRating(ratingAverage, ratingCount)) {
    return null;
  }

  const averageRating = ratingAverage ?? 0;
  return `${averageRating.toFixed(1)} (${ratingCount})`;
}

export function formatBusinessAvailability(cluster: MarketplaceBusinessCluster): string {
  const availableOffers = cluster.business.availableOfferCount;
  const unavailableOffers = cluster.business.unavailableOfferCount;
  const availableLabel = `${availableOffers} live ${availableOffers === 1 ? 'offer' : 'offers'}`;

  if (!unavailableOffers) {
    return availableLabel;
  }

  return `${availableLabel} | ${unavailableOffers} unavailable`;
}

export function formatAddress(address: MarketplaceBusinessCluster['business']['address']): string {
  return [address.street, address.city, address.country].filter(Boolean).join(', ');
}

export function resolveOfferDiscountPercentage(offer: MarketplaceOfferModel): number {
  if (
    typeof offer.originalPrice !== 'number' ||
    offer.originalPrice <= 0 ||
    offer.originalPrice <= offer.price
  ) {
    return 0;
  }

  return Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 100);
}

export function resolveOfferPickupDate(offer: MarketplaceOfferModel): Date | null {
  const pickupFrom = new Date(offer.pickupTimeWindow.from);
  return Number.isNaN(pickupFrom.getTime()) ? null : pickupFrom;
}

export function parseTimeValueToMinutes(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const [hours, minutes] = value.split(':').map((segment) => Number.parseInt(segment, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function isSameCalendarDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
