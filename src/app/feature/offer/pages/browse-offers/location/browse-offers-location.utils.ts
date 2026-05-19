import { MarketplaceViewMode } from '../../../models/marketplace-offer.model';
import {
  LEGACY_LOCATION_STORAGE_KEY,
  LOCATION_STORAGE_KEY,
  MapScopeOption,
  ViewerLocation,
} from '../browse-offers.models';

export type FilterLocationActionKind =
  | 'none'
  | 'clear-location-filter'
  | 'request-current-location'
  | 'use-current-location'
  | 'select-city';

export interface FilterLocationAction {
  kind: FilterLocationActionKind;
  shouldUpdateSelectedCity: boolean;
  nextSelectedCity: string | null;
  shouldClearViewerLocation: boolean;
  shouldClearLocationError: boolean;
  shouldRemoveStoredViewerLocation: boolean;
  shouldSyncLocationSearch: boolean;
  shouldEnforceMapScopeSelectionUi: boolean;
}

export interface SelectedCityUpdatePlan {
  nextSelectedCity: string | null;
  hadViewerLocation: boolean;
  shouldClearLocationError: boolean;
  shouldRemoveStoredViewerLocation: boolean;
}

export function readStoredViewerLocation(): ViewerLocation | null {
  const rawValue =
    localStorage.getItem(LOCATION_STORAGE_KEY) ?? localStorage.getItem(LEGACY_LOCATION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(rawValue) as Partial<ViewerLocation>;
    if (typeof parsedValue.latitude !== 'number' || typeof parsedValue.longitude !== 'number') {
      return null;
    }

    return {
      latitude: parsedValue.latitude,
      longitude: parsedValue.longitude,
    };
  } catch {
    return null;
  }
}

export function storeViewerLocation(location: ViewerLocation): void {
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
  localStorage.removeItem(LEGACY_LOCATION_STORAGE_KEY);
}

export function removeStoredViewerLocation(): void {
  localStorage.removeItem(LOCATION_STORAGE_KEY);
  localStorage.removeItem(LEGACY_LOCATION_STORAGE_KEY);
}

export function resolveLocationSearchValue(
  locating: boolean,
  viewerLocation: ViewerLocation | null,
  currentLocationOptionLabel: string,
  selectedCity: string | null,
): string {
  if (locating) {
    return 'Locating...';
  }

  if (viewerLocation) {
    return currentLocationOptionLabel;
  }

  return selectedCity ?? '';
}

export function shouldOpenMapScopeSelection(
  viewMode: MarketplaceViewMode,
  viewerLocation: ViewerLocation | null,
  selectedCity: string | null,
): boolean {
  return viewMode === 'MAP' && !viewerLocation && !selectedCity;
}

export function resolveFilterLocationAction(
  location: string,
  currentLocationOptionLabel: string,
  viewerLocation: ViewerLocation | null,
  cityOptions: readonly MapScopeOption[],
): FilterLocationAction {
  const normalizedLocation = location.trim();
  const matchedCity = findMatchingCityOption(cityOptions, normalizedLocation);

  if (!normalizedLocation) {
    return {
      kind: 'clear-location-filter',
      shouldUpdateSelectedCity: true,
      nextSelectedCity: null,
      shouldClearViewerLocation: viewerLocation !== null,
      shouldClearLocationError: viewerLocation !== null,
      shouldRemoveStoredViewerLocation: viewerLocation !== null,
      shouldSyncLocationSearch: true,
      shouldEnforceMapScopeSelectionUi: true,
    };
  }

  if (normalizedLocation.toLowerCase() === currentLocationOptionLabel.toLowerCase()) {
    if (viewerLocation === null) {
      return {
        kind: 'request-current-location',
        shouldUpdateSelectedCity: false,
        nextSelectedCity: null,
        shouldClearViewerLocation: false,
        shouldClearLocationError: false,
        shouldRemoveStoredViewerLocation: false,
        shouldSyncLocationSearch: false,
        shouldEnforceMapScopeSelectionUi: false,
      };
    }

    return {
      kind: 'use-current-location',
      shouldUpdateSelectedCity: true,
      nextSelectedCity: null,
      shouldClearViewerLocation: false,
      shouldClearLocationError: false,
      shouldRemoveStoredViewerLocation: false,
      shouldSyncLocationSearch: true,
      shouldEnforceMapScopeSelectionUi: false,
    };
  }

  if (matchedCity !== null) {
    return {
      kind: 'select-city',
      shouldUpdateSelectedCity: true,
      nextSelectedCity: matchedCity.city,
      shouldClearViewerLocation: viewerLocation !== null,
      shouldClearLocationError: viewerLocation !== null,
      shouldRemoveStoredViewerLocation: viewerLocation !== null,
      shouldSyncLocationSearch: true,
      shouldEnforceMapScopeSelectionUi: false,
    };
  }

  return {
    kind: 'none',
    shouldUpdateSelectedCity: false,
    nextSelectedCity: null,
    shouldClearViewerLocation: false,
    shouldClearLocationError: false,
    shouldRemoveStoredViewerLocation: false,
    shouldSyncLocationSearch: false,
    shouldEnforceMapScopeSelectionUi: false,
  };
}

export function resolveSelectedCityUpdate(
  value: string,
  viewerLocation: ViewerLocation | null,
): SelectedCityUpdatePlan {
  return {
    nextSelectedCity: value || null,
    hadViewerLocation: viewerLocation !== null,
    shouldClearLocationError: viewerLocation !== null,
    shouldRemoveStoredViewerLocation: viewerLocation !== null,
  };
}

function findMatchingCityOption(
  cityOptions: readonly MapScopeOption[],
  location: string,
): MapScopeOption | null {
  const normalizedLocation = location.trim().toLowerCase();
  if (!normalizedLocation) {
    return null;
  }

  return cityOptions.find((option) => option.city.toLowerCase() === normalizedLocation) ?? null;
}
