import { appIcons } from '../../../../shared/icons/app-icons';
import { OfferCardModel } from '../../../../shared/ui/offer-card/offer-card.models';
import { OfferFilters } from './components/offer-filter-modal/offer-filter-modal.models';
import {
  MarketplaceBusinessSummaryModel,
  MarketplaceOfferModel,
  MarketplaceOfferSort,
  MarketplaceViewMode,
} from '../../models/marketplace-offer.model';

export interface ViewerLocation {
  latitude: number;
  longitude: number;
}

export interface MapScopeOption {
  city: string;
  latitude: number;
  longitude: number;
  businessCount: number;
}

export interface MapReferencePoint {
  latitude: number;
  longitude: number;
  label: string;
}

export interface MarketplaceBusinessCluster {
  business: MarketplaceBusinessSummaryModel;
  offers: MarketplaceOfferModel[];
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
}

export interface MarketplaceUrlState {
  query: string;
  sort: MarketplaceOfferSort;
  includeUnavailable: boolean;
  view: MarketplaceViewMode;
  city: string | null;
  radiusKm: number;
  filters: OfferFilters;
}

export type BrowseCategoryFilter = 'ALL' | 'BAKERY' | 'MEALS' | 'GROCERY';
export type BrowsePriceFilter = 'ALL' | 'UNDER_5' | 'UNDER_7' | 'UNDER_10' | 'ABOVE_10';

export interface BrowseFilterOption<TValue extends string> {
  value: TValue;
  label: string;
  icon: keyof typeof appIcons;
}

export interface VisibleOfferCardItem {
  offer: MarketplaceOfferModel;
  card: OfferCardModel;
}

export interface GoogleMapsApi {
  maps: {
    Map: new (element: HTMLElement, options?: Record<string, unknown>) => any;
    Marker: new (options?: Record<string, unknown>) => any;
    InfoWindow: new (options?: Record<string, unknown>) => any;
    LatLng: new (latitude: number, longitude: number) => any;
    LatLngBounds: new () => {
      extend(coordinates: { lat: number; lng: number }): void;
    };
    OverlayView: new () => any;
    Point: new (x: number, y: number) => any;
    Size: new (width: number, height: number) => any;
    SymbolPath: {
      CIRCLE: unknown;
    };
    event?: {
      trigger(instance: unknown, eventName: string): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleMapsApi;
  }
}

export const LOCATION_STORAGE_KEY = 'savr:browse-viewer-location';
export const LEGACY_LOCATION_STORAGE_KEY = 'food-rescue:browse-viewer-location';
export const DEFAULT_MAP_CENTER = { lat: 48.719, lng: 19.699 };
export const DEFAULT_MAP_ZOOM = 7;
export const LOCATION_ZOOM = 13;
export const LOCATION_REQUEST_TIMEOUT_MS = 10000;
export const SEARCH_DEBOUNCE_MS = 300;
export const DEFAULT_RADIUS_KM = 30;
export const MIN_RADIUS_KM = 1;
export const MAX_RADIUS_KM = 100;
export const MAP_FIT_BOUNDS_PADDING = 72;
export const MAP_MARKER_ZOOM = 16;
export const FULL_MAP_CAROUSEL_LIMIT = 5;
export const RADIUS_PRESET_OPTIONS = [5, 10, 20, 30, 50, 100] as const;
export const SORT_OPTIONS: readonly MarketplaceOfferSort[] = [
  'DISTANCE',
  'PICKUP_SOONEST',
  'PRICE_ASC',
  'NEWEST',
];
export const VIEW_MODES: readonly MarketplaceViewMode[] = ['LIST', 'MAP'];
export const MANAGED_QUERY_PARAMS = [
  'q',
  'sort',
  'includeUnavailable',
  'view',
  'city',
  'radiusKm',
  'filters',
] as const;
export const CATEGORY_FILTER_OPTIONS: readonly BrowseFilterOption<BrowseCategoryFilter>[] = [
  { value: 'ALL', label: 'All', icon: 'list' },
  { value: 'BAKERY', label: 'Bakery', icon: 'store' },
  { value: 'MEALS', label: 'Meals', icon: 'bagShopping' },
  { value: 'GROCERY', label: 'Grocery', icon: 'leaf' },
] as const;
export const PRICE_FILTER_OPTIONS: readonly { value: BrowsePriceFilter; label: string }[] = [
  { value: 'ALL', label: 'Any price' },
  { value: 'UNDER_5', label: 'Under \u20ac5' },
  { value: 'UNDER_7', label: 'Under \u20ac7' },
  { value: 'UNDER_10', label: 'Under \u20ac10' },
  { value: 'ABOVE_10', label: '\u20ac10+' },
] as const;
export const BUSINESS_MARKER_ICON_OVERRIDES: Readonly<Record<number, string>> = {};
export const SAVR_MAP_STYLES: readonly Record<string, unknown>[] = [
  {
    featureType: 'poi.business',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.attraction',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.government',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.medical',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.place_of_worship',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.school',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'transit',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#dfeedd' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#5f7c60' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#d7e7f2' }],
  },
] as const;
