import { MarketplaceViewMode } from '../../../models/marketplace-offer.model';
import { MapScopeOption, ViewerLocation } from '../browse-offers.models';

export function filterCityOptions(
  cityOptions: readonly MapScopeOption[],
  query: string,
  viewerLocation: ViewerLocation | null,
  currentLocationOptionLabel: string,
  selectedCity: string | null,
  locating: boolean,
): readonly MapScopeOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  const activeLabel = viewerLocation ? currentLocationOptionLabel : selectedCity;

  if (
    !normalizedQuery ||
    (activeLabel !== null && normalizedQuery === activeLabel.toLowerCase()) ||
    (locating && normalizedQuery === 'locating...')
  ) {
    return cityOptions;
  }

  return cityOptions.filter((option) => option.city.toLowerCase().includes(normalizedQuery));
}

export function buildResultsHeadline(
  visibleOfferCount: number,
  viewerLocation: ViewerLocation | null,
  selectedCity: string | null,
): string {
  const noun = visibleOfferCount === 1 ? 'offer' : 'offers';

  if (viewerLocation) {
    return `${visibleOfferCount} ${noun} near you`;
  }

  if (selectedCity) {
    return `${visibleOfferCount} ${noun} in ${selectedCity}`;
  }

  return `${visibleOfferCount} ${noun} available now`;
}

export function buildCarouselRangeLabel(
  totalCards: number,
  startIndex: number,
  visibleCount: number,
): string | null {
  if (!totalCards) {
    return null;
  }

  const startLabel = startIndex + 1;
  const endLabel = Math.min(startIndex + visibleCount, totalCards);
  return startLabel === endLabel
    ? `Showing ${startLabel} of ${totalCards}`
    : `Showing ${startLabel}-${endLabel} of ${totalCards}`;
}

export function buildEmptyResultsTitle(
  selectedBusinessName: string | null,
  viewerLocation: ViewerLocation | null,
  selectedCity: string | null,
  radiusKm: number,
): string {
  if (selectedBusinessName) {
    return `No matching offers from ${selectedBusinessName} right now`;
  }

  if (viewerLocation) {
    return `No matching offers within ${radiusKm} km of your location`;
  }

  if (selectedCity) {
    return `No matching offers around ${selectedCity} right now`;
  }

  return 'No offers match this view right now';
}

export function buildEmptyResultsMessage(viewMode: MarketplaceViewMode): string {
  if (viewMode === 'MAP') {
    return 'Your map, location, and filters are still active here. Widen the search radius, switch the scope, or clear the current filters to keep exploring.';
  }

  return 'Adjust the current filters, clear the selected business, or refresh after new rescue bags go live.';
}

export function buildMapEmptyTitle(
  viewerLocation: ViewerLocation | null,
  selectedCity: string | null,
): string {
  if (viewerLocation) {
    return 'No offers near your pinned location';
  }

  if (selectedCity) {
    return `No offers around ${selectedCity}`;
  }

  return 'No businesses in scope yet';
}

export function buildMapEmptyMessage(
  viewerLocation: ViewerLocation | null,
  selectedCity: string | null,
  radiusKm: number,
  nextRadiusKm: number,
): string {
  if (viewerLocation) {
    return `The map is centered on your current location. Try ${nextRadiusKm} km or change filters to inspect a wider area.`;
  }

  if (selectedCity) {
    return `The map stays focused on ${selectedCity} within ${radiusKm} km, but no offers match the active filters here.`;
  }

  return 'Try another city, radius, or refresh your current location to inspect a different area.';
}
