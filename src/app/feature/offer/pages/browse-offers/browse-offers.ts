import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { runtimeConfig } from '../../../../core/config/runtime-config';
import { resolveBusinessIconUrl } from '../../../business/models/business.model';
import { BusinessWorkspaceStateService } from '../../../business/services/business-workspace-state.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { OfferFilterModalComponent } from '../../components/offer-filter-modal/offer-filter-modal.component';
import {
  cloneOfferFilters,
  createDefaultOfferFilters,
  DEFAULT_PRICE_RANGE,
  normalizeOfferFilters,
  OfferFilters,
  OfferFilterSortBy,
} from '../../components/offer-filter-modal/offer-filter-modal.models';
import {
  OfferCardComponent,
} from '../../../../shared/ui/offer-card/offer-card';
import { OfferCardModel } from '../../../../shared/ui/offer-card/offer-card.models';
import {
  buildOfferBusinessMark,
  createMarketplaceOfferCardModel,
  formatOfferAvailabilityLabel,
  formatOfferDistance,
  formatOfferPickupWindow,
  formatOfferRatingValue,
} from '../../../../shared/ui/offer-card/offer-card.utils';
import {
  MarketplaceBusinessSummaryModel,
  MarketplaceOfferModel,
  MarketplaceOfferSort,
  MarketplaceViewMode,
} from '../../models/marketplace-offer.model';
import { AllergenCode, OfferCategory, OfferStatus } from '../../models/offer.model';
import { MarketplaceOfferApiService } from '../../services/marketplace-offer-api.service';
import { OfferCartService } from '../../services/offer-cart.service';

interface ViewerLocation {
  latitude: number;
  longitude: number;
}

interface MapScopeOption {
  city: string;
  latitude: number;
  longitude: number;
  businessCount: number;
}

interface MarketplaceBusinessCluster {
  business: MarketplaceBusinessSummaryModel;
  offers: MarketplaceOfferModel[];
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
}

interface MarketplaceUrlState {
  query: string;
  sort: MarketplaceOfferSort;
  includeUnavailable: boolean;
  view: MarketplaceViewMode;
  city: string | null;
  radiusKm: number;
}

type BrowseCategoryFilter = 'ALL' | 'BAKERY' | 'MEALS' | 'GROCERY';
type BrowsePriceFilter = 'ALL' | 'UNDER_5' | 'UNDER_7' | 'UNDER_10' | 'ABOVE_10';

interface BrowseFilterOption<TValue extends string> {
  value: TValue;
  label: string;
  icon: keyof typeof appIcons;
}

interface VisibleOfferCardItem {
  offer: MarketplaceOfferModel;
  card: OfferCardModel;
}

interface GoogleMapsApi {
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

const GOOGLE_MAPS_SCRIPT_ID = 'savr-google-maps-script';
const LOCATION_STORAGE_KEY = 'savr:browse-viewer-location';
const LEGACY_LOCATION_STORAGE_KEY = 'food-rescue:browse-viewer-location';
const DEFAULT_MAP_CENTER = { lat: 48.719, lng: 19.699 };
const DEFAULT_MAP_ZOOM = 7;
const LOCATION_ZOOM = 13;
const LOCATION_REQUEST_TIMEOUT_MS = 10000;
const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_RADIUS_KM = 30;
const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 300;
const MAP_FIT_BOUNDS_PADDING = 72;
const MAP_MARKER_ZOOM = 16;
const FULL_MAP_CAROUSEL_LIMIT = 5;
const RADIUS_PRESET_OPTIONS = [5, 10, 20, 30, 50, 100] as const;
const SORT_OPTIONS: readonly MarketplaceOfferSort[] = ['DISTANCE', 'PICKUP_SOONEST', 'PRICE_ASC', 'NEWEST'];
const VIEW_MODES: readonly MarketplaceViewMode[] = ['LIST', 'MAP'];
const MANAGED_QUERY_PARAMS = ['q', 'sort', 'includeUnavailable', 'view', 'city', 'radiusKm'] as const;
const CATEGORY_FILTER_OPTIONS: readonly BrowseFilterOption<BrowseCategoryFilter>[] = [
  { value: 'ALL', label: 'All', icon: 'list' },
  { value: 'BAKERY', label: 'Bakery', icon: 'store' },
  { value: 'MEALS', label: 'Meals', icon: 'bagShopping' },
  { value: 'GROCERY', label: 'Grocery', icon: 'leaf' },
] as const;
const PRICE_FILTER_OPTIONS: readonly { value: BrowsePriceFilter; label: string }[] = [
  { value: 'ALL', label: 'Any price' },
  { value: 'UNDER_5', label: 'Under €5' },
  { value: 'UNDER_7', label: 'Under €7' },
  { value: 'UNDER_10', label: 'Under €10' },
  { value: 'ABOVE_10', label: '€10+' },
] as const;
const BUSINESS_MARKER_ICON_OVERRIDES: Readonly<Record<number, string>> = {};
const SAVR_MAP_STYLES: readonly Record<string, unknown>[] = [
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

let googleMapsLoader: Promise<GoogleMapsApi> | null = null;

function currentGoogleMapsApi(): GoogleMapsApi | null {
  return window.google ?? null;
}

function ensureGoogleMapsLoaded(apiKey: string): Promise<GoogleMapsApi> {
  const existingGoogleMaps = currentGoogleMapsApi();
  if (existingGoogleMaps) {
    return Promise.resolve(existingGoogleMaps);
  }

  if (googleMapsLoader) {
    return googleMapsLoader;
  }

  googleMapsLoader = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        const loadedGoogleMaps = currentGoogleMapsApi();
        if (loadedGoogleMaps) {
          resolve(loadedGoogleMaps);
          return;
        }

        reject(new Error('Google Maps loaded without exposing a global API.'));
      });
      existingScript.addEventListener('error', () => reject(new Error('Google Maps could not be loaded.')));
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const loadedGoogleMaps = currentGoogleMapsApi();
      if (loadedGoogleMaps) {
        resolve(loadedGoogleMaps);
        return;
      }

      reject(new Error('Google Maps loaded without exposing a global API.'));
    };
    script.onerror = () => reject(new Error('Google Maps could not be loaded.'));
    document.head.appendChild(script);
  }).catch((error) => {
    googleMapsLoader = null;
    throw error;
  });

  return googleMapsLoader;
}

function isMarketplaceOfferSort(value: string): value is MarketplaceOfferSort {
  return SORT_OPTIONS.includes(value as MarketplaceOfferSort);
}

function isMarketplaceViewMode(value: string): value is MarketplaceViewMode {
  return VIEW_MODES.includes(value as MarketplaceViewMode);
}

function isRadiusPresetOption(value: number): boolean {
  return RADIUS_PRESET_OPTIONS.includes(value as (typeof RADIUS_PRESET_OPTIONS)[number]);
}

function normalizeRadiusKm(value: string | number | null | undefined): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_RADIUS_KM;
  }

  return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(numericValue)));
}

function normalizeRadiusPresetKm(value: string | number | null | undefined): number {
  const normalizedRadiusKm = normalizeRadiusKm(value);
  return isRadiusPresetOption(normalizedRadiusKm) ? normalizedRadiusKm : DEFAULT_RADIUS_KM;
}

function parseBooleanParam(value: string | null, defaultValue: boolean): boolean {
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

function resolveDistanceMeters(
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

@Component({
  selector: 'app-browse-offers-page',
  imports: [FontAwesomeModule, RouterLink, ActionButtonComponent, OfferCardComponent, OfferFilterModalComponent],
  templateUrl: './browse-offers.html',
  styleUrl: './browse-offers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowseOffersPage implements OnDestroy {
  private readonly marketplaceOfferApi = inject(MarketplaceOfferApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly offerCart = inject(OfferCartService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly googleMapsApiKey = runtimeConfig.googleMapsApiKey;

  private googleMaps: GoogleMapsApi | null = null;
  private map: any | null = null;
  private infoWindow: any | null = null;
  private mapHost: HTMLDivElement | null = null;
  private mapCanvasWrap: HTMLDivElement | null = null;
  private businessMarkers = new Map<number, any>();
  private viewerMarker: any | null = null;
  private searchDebounceId: number | null = null;

  @ViewChild('mapHost')
  private set mapHostElement(elementRef: ElementRef<HTMLDivElement> | undefined) {
    const nextHost = elementRef?.nativeElement ?? null;
    const hostChanged = this.mapHost !== nextHost;

    if (hostChanged && this.mapHost) {
      this.disposeMap();
    }

    this.mapHost = nextHost;
    if (this.mapHost) {
      void this.initializeMap();
    }
  }

  @ViewChild('mapCanvasWrap')
  private set mapCanvasWrapElement(elementRef: ElementRef<HTMLDivElement> | undefined) {
    this.mapCanvasWrap = elementRef?.nativeElement ?? null;
    this.syncNativeMapFullscreenState();
  }

  protected readonly user = this.userService.getUser();
  protected readonly icons = appIcons;
  protected readonly ownedBusinessIds = computed(() => new Set(this.businessWorkspaceState.knownBusinesses().map((business) => business.id)));
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly viewModes = VIEW_MODES;
  protected readonly radiusPresetOptions = RADIUS_PRESET_OPTIONS;
  protected readonly categoryFilterOptions = CATEGORY_FILTER_OPTIONS;
  protected readonly priceFilterOptions = PRICE_FILTER_OPTIONS;
  protected readonly loadingSkeletonIds = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  protected readonly offers = signal<MarketplaceOfferModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly locationError = signal<string | null>(null);
  protected readonly mapError = signal<string | null>(null);
  protected readonly locating = signal(false);
  protected readonly searchText = signal('');
  protected readonly filterModalOpen = signal(false);
  protected readonly filterModalDraftFilters = signal<OfferFilters | null>(null);
  protected readonly pickupTodayOnly = signal(false);
  protected readonly categoryFilter = signal<BrowseCategoryFilter>('ALL');
  protected readonly priceFilter = signal<BrowsePriceFilter>('ALL');
  protected readonly appliedOfferFilters = signal<OfferFilters>(createDefaultOfferFilters());
  protected readonly selectedCity = signal<string | null>(null);
  protected readonly selectedBusinessId = signal<number | null>(null);
  protected readonly selectedOfferId = signal<number | null>(null);
  protected readonly viewMode = signal<MarketplaceViewMode>('LIST');
  protected readonly isFullMapMode = signal(false);
  protected readonly isNativeMapFullscreen = signal(false);
  protected readonly carouselStartIndex = signal(0);
  protected readonly sort = signal<MarketplaceOfferSort>('DISTANCE');
  protected readonly includeUnavailable = signal(true);
  protected readonly radiusKm = signal(DEFAULT_RADIUS_KM);
  protected readonly viewerLocation = signal<ViewerLocation | null>(this.readStoredViewerLocation());
  protected readonly cartCount = this.offerCart.count;
  protected readonly locationPickerOpen = signal(false);
  protected readonly locationSearch = signal('');
  protected readonly currentLocationOptionLabel = 'Current location';
  protected readonly filterLocationOptions = computed(() => {
    const options = new Set<string>([this.currentLocationOptionLabel]);
    for (const option of this.cityOptions()) {
      options.add(option.city);
    }
    return Array.from(options);
  });
  protected readonly filterModalState = computed<OfferFilters>(() => {
    const nextFilters = cloneOfferFilters(this.appliedOfferFilters());
    nextFilters.location = this.viewerLocation() ? this.currentLocationOptionLabel : (this.selectedCity() ?? '');
    nextFilters.distanceKm = this.radiusKm();
    nextFilters.hideSoldOut = !this.includeUnavailable();
    nextFilters.pickupDay = this.pickupTodayOnly()
      ? 'today'
      : (nextFilters.pickupDay === 'today' ? 'any' : nextFilters.pickupDay);
    nextFilters.sortBy = this.resolveCurrentSortBy(nextFilters.sortBy);
    return nextFilters;
  });
  protected readonly allowAllCitiesSelection = computed(() => this.viewMode() !== 'MAP');
  protected readonly locationLabel = computed(() => {
    if (this.viewerLocation()) {
      return this.currentLocationOptionLabel;
    }

    return 'All cities';
  });
  protected readonly locationPlaceholder = computed(() =>
    this.allowAllCitiesSelection() ? 'All cities' : 'Choose city or current location',
  );
  protected readonly filteredCityOptions = computed(() => {
    const query = this.locationSearch().trim();
    const normalizedQuery = query.toLowerCase();
    const activeLabel = this.viewerLocation()
      ? this.currentLocationOptionLabel
      : this.selectedCity();

    if (
      !query ||
      (activeLabel !== null && normalizedQuery === activeLabel.toLowerCase()) ||
      (this.locating() && normalizedQuery === 'locating...')
    ) {
      return this.cityOptions();
    }

    return this.cityOptions().filter((option) => option.city.toLowerCase().includes(normalizedQuery));
  });
  protected readonly resultsHeadline = computed(() => {
    const count = this.summary().visibleOffers;
    const noun = count === 1 ? 'offer' : 'offers';

    if (this.viewerLocation()) {
      return `${count} ${noun} near you`;
    }

    if (this.selectedCity()) {
      return `${count} ${noun} in ${this.selectedCity()}`;
    }

    return `${count} ${noun} available now`;
  });
  protected readonly hasVisibleOffers = computed(() => this.visibleOffers().length > 0);
  protected readonly filterModalResultCount = computed(() => {
    const draftFilters = this.filterModalDraftFilters();
    if (draftFilters === null) {
      return this.visibleOffers().length;
    }

    return this.computeVisibleOffers(draftFilters).length;
  });
  protected readonly nextRadiusKm = computed(() => {
    const currentRadiusKm = this.radiusKm();
    const nextPresetRadiusKm = RADIUS_PRESET_OPTIONS.find((option) => option > currentRadiusKm);
    return nextPresetRadiusKm ?? Math.min(MAX_RADIUS_KM, currentRadiusKm * 2);
  });
  protected readonly canExpandRadius = computed(() =>
    this.mapReferencePoint() !== null
    && this.nextRadiusKm() > this.radiusKm(),
  );
  protected readonly emptyResultsTitle = computed(() => {
    const selectedBusiness = this.selectedBusiness();
    if (selectedBusiness) {
      return `No matching offers from ${selectedBusiness.business.name} right now`;
    }

    if (this.viewerLocation()) {
      return `No matching offers within ${this.radiusKm()} km of your location`;
    }

    if (this.selectedCity()) {
      return `No matching offers around ${this.selectedCity()} right now`;
    }

    return 'No offers match this view right now';
  });
  protected readonly emptyResultsMessage = computed(() => {
    if (this.viewMode() === 'MAP') {
      return 'Your map, location, and filters are still active here. Widen the search radius, switch the scope, or clear the current filters to keep exploring.';
    }

    return 'Adjust the current filters, clear the selected business, or refresh after new rescue bags go live.';
  });
  protected readonly mapEmptyTitle = computed(() => {
    if (this.viewerLocation()) {
      return 'No offers near your pinned location';
    }

    if (this.selectedCity()) {
      return `No offers around ${this.selectedCity()}`;
    }

    return 'No businesses in scope yet';
  });
  protected readonly mapEmptyMessage = computed(() => {
    const radiusKm = this.radiusKm();
    if (this.viewerLocation()) {
      return `The map is centered on your current location. Try ${this.nextRadiusKm()} km or change filters to inspect a wider area.`;
    }

    if (this.selectedCity()) {
      return `The map stays focused on ${this.selectedCity()} within ${radiusKm} km, but no offers match the active filters here.`;
    }

    return 'Try another city, radius, or refresh your current location to inspect a different area.';
  });
  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.searchText().trim()) ||
    this.selectedCity() !== null ||
    this.viewerLocation() !== null ||
    this.activeFilterCount() > 0 ||
    this.selectedBusinessId() !== null,
  );
  protected readonly activeFilterCount = computed(() => {
    const filters = this.filterModalState();
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
    if (this.radiusKm() !== DEFAULT_RADIUS_KM) {
      count += 1;
    }
    return count;
  });

  protected readonly businessClusters = computed<MarketplaceBusinessCluster[]>(() => {
    const clusters = new Map<number, MarketplaceBusinessCluster>();

    for (const offer of this.offers()) {
      const existingCluster = clusters.get(offer.business.id);
      const latitude = offer.pickupLocation.address.latitude ?? offer.business.address.latitude ?? null;
      const longitude = offer.pickupLocation.address.longitude ?? offer.business.address.longitude ?? null;
      const city = offer.pickupLocation.address.city?.trim() || offer.business.address.city?.trim() || null;

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
  });
  protected readonly cityOptions = computed<MapScopeOption[]>(() => {
    const options = new Map<string, { latitudeTotal: number; longitudeTotal: number; businessCount: number }>();

    for (const cluster of this.businessClusters()) {
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
  });
  protected readonly activeCityOption = computed(
    () => this.cityOptions().find((option) => option.city === this.selectedCity()) ?? null,
  );
  protected readonly mapReferencePoint = computed(() => {
    const viewerLocation = this.viewerLocation();
    if (viewerLocation) {
      return {
        latitude: viewerLocation.latitude,
        longitude: viewerLocation.longitude,
        label: 'your current location',
      };
    }

    const cityOption = this.activeCityOption();
    if (cityOption) {
      return {
        latitude: cityOption.latitude,
        longitude: cityOption.longitude,
        label: cityOption.city,
      };
    }

    return null;
  });
  protected readonly mapScopeRequired = computed(() => this.viewMode() === 'MAP' && this.mapReferencePoint() === null);
  protected readonly mapScopedBusinesses = computed(() => {
    if (this.viewMode() !== 'MAP') {
      return this.mappedBusinesses();
    }

    const referencePoint = this.mapReferencePoint();
    if (referencePoint === null) {
      return [];
    }

    const scopeRadiusMeters = this.radiusKm() * 1000;
    return this.mappedBusinesses().filter((cluster) => {
      const distanceMeters = resolveDistanceMeters(
        referencePoint.latitude,
        referencePoint.longitude,
        cluster.latitude,
        cluster.longitude,
      );
      return distanceMeters !== null && distanceMeters <= scopeRadiusMeters;
    });
  });
  protected readonly visibleOffers = computed(() => {
    return this.computeVisibleOffers(this.filterModalState());
  });
  protected readonly visibleOfferCards = computed<VisibleOfferCardItem[]>(() =>
    this.visibleOffers().map((offer) => ({
      offer,
      card: this.buildOfferCard(offer),
    })),
  );
  protected readonly selectedBusiness = computed(
    () => this.businessClusters().find((cluster) => cluster.business.id === this.selectedBusinessId()) ?? null,
  );
  protected readonly selectedOffer = computed(
    () => this.offers().find((offer) => offer.id === this.selectedOfferId()) ?? null,
  );
  protected readonly mappedBusinesses = computed(() =>
    this.businessClusters().filter((cluster) => cluster.latitude !== null && cluster.longitude !== null),
  );
  protected readonly isSplitMapLayout = computed(() => this.viewMode() === 'MAP' && !this.isFullMapMode());
  protected readonly isImmersiveMapMode = computed(
    () => this.viewMode() === 'MAP' && (this.isFullMapMode() || this.isNativeMapFullscreen()),
  );
  protected readonly selectedBusinessOffers = computed<MarketplaceOfferModel[]>(() => {
    const selectedBusinessId = this.selectedBusinessId();
    if (selectedBusinessId === null) {
      return [];
    }

    const matchingOffers = this.offers().filter((offer) => offer.business.id === selectedBusinessId);
    const selectedOfferId = this.selectedOfferId();
    if (selectedOfferId === null) {
      return matchingOffers;
    }

    const selectedOffer = matchingOffers.find((offer) => offer.id === selectedOfferId);
    if (!selectedOffer) {
      return matchingOffers;
    }

    return [selectedOffer, ...matchingOffers.filter((offer) => offer.id !== selectedOfferId)];
  });
  protected readonly selectedBusinessOfferCards = computed<VisibleOfferCardItem[]>(() =>
    this.selectedBusinessOffers().map((offer) => ({
      offer,
      card: this.buildOfferCard(offer),
    })),
  );
  protected readonly selectedBusinessCarouselStartIndex = computed(() =>
    Math.min(
      this.carouselStartIndex(),
      Math.max(this.selectedBusinessOfferCards().length - FULL_MAP_CAROUSEL_LIMIT, 0),
    ),
  );
  protected readonly selectedBusinessCarouselOfferCards = computed<VisibleOfferCardItem[]>(() => {
    const startIndex = this.selectedBusinessCarouselStartIndex();
    return this.selectedBusinessOfferCards().slice(startIndex, startIndex + FULL_MAP_CAROUSEL_LIMIT);
  });
  protected readonly canScrollCarouselBackward = computed(() => this.selectedBusinessCarouselStartIndex() > 0);
  protected readonly canScrollCarouselForward = computed(
    () =>
      this.selectedBusinessCarouselStartIndex() + this.selectedBusinessCarouselOfferCards().length
      < this.selectedBusinessOfferCards().length,
  );
  protected readonly selectedBusinessCarouselRangeLabel = computed(() => {
    const totalCards = this.selectedBusinessOfferCards().length;
    if (!totalCards) {
      return null;
    }

    const startIndex = this.selectedBusinessCarouselStartIndex();
    const visibleCount = this.selectedBusinessCarouselOfferCards().length;
    const startLabel = startIndex + 1;
    const endLabel = Math.min(startIndex + visibleCount, totalCards);
    return startLabel === endLabel
      ? `Showing ${startLabel} of ${totalCards}`
      : `Showing ${startLabel}-${endLabel} of ${totalCards}`;
  });
  protected readonly shouldShowFullMapCarousel = computed(
    () => this.isImmersiveMapMode() && this.selectedBusinessCarouselOfferCards().length > 0,
  );
  protected readonly mapSummaryLabel = computed(() => {
    const businesses = this.mapScopedBusinesses().length;
    const offers = this.visibleOffers().length;
    const businessLabel = businesses === 1 ? 'business' : 'businesses';
    const offerLabel = offers === 1 ? 'offer' : 'offers';
    return `${businesses} ${businessLabel} · ${offers} ${offerLabel}`;
  });
  protected readonly summary = computed(() => ({
    totalOffers: this.offers().length,
    visibleOffers: this.visibleOffers().length,
    businesses: this.businessClusters().length,
    visibleBusinesses: new Set(this.visibleOffers().map((offer) => offer.business.id)).size,
    available: this.offers().filter((offer) => offer.status === 'AVAILABLE').length,
    unavailable: this.offers().filter((offer) => offer.status !== 'AVAILABLE').length,
  }));

  constructor() {
    this.applyUrlState(this.readUrlState(this.route.snapshot.queryParamMap));
    this.syncLocationSearchFromState();
    this.enforceMapScopeSelectionUi();

    if (!this.route.snapshot.queryParamMap.has('view') && this.viewerLocation()) {
      this.viewMode.set('MAP');
    }

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((queryParams) => {
        const outcome = this.applyUrlState(this.readUrlState(queryParams));
        if (!outcome.changed) {
          return;
        }

        this.syncLocationSearchFromState();
        this.enforceMapScopeSelectionUi();

        if (outcome.requiresReload) {
          this.loadOffers();
          return;
        }

        this.reconcileCitySelection();
        this.reconcileMapSelection();
        this.queueMapRender(true);
      });

    this.loadOffers();
  }

  ngOnDestroy(): void {
    if (this.searchDebounceId !== null) {
      window.clearTimeout(this.searchDebounceId);
    }

    this.disposeMap();
  }

  @HostListener('document:keydown.escape')
  protected handleEscapeKey(): void {
    if (this.filterModalOpen()) {
      this.closeFilterModal();
    }

    if (this.locationPickerOpen()) {
      this.closeLocationPicker();
    }
  }

  @HostListener('document:fullscreenchange')
  protected handleFullscreenChange(): void {
    this.syncNativeMapFullscreenState();
    this.queueMapRender(this.selectedBusinessId() !== null);
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.locationPickerOpen()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('.browse-location-picker')) {
      return;
    }

    this.closeLocationPicker();
  }

  protected refreshOffers(): void {
    this.loadOffers();
  }

  protected expandRadius(): void {
    if (!this.canExpandRadius()) {
      return;
    }

    this.radiusKm.set(this.nextRadiusKm());
    this.reconcileMapSelection();
    this.syncUrlState();
    if (this.viewerLocation()) {
      this.loadOffers();
    }
    this.queueMapRender(true);
  }

  protected openFilterModal(): void {
    this.filterModalDraftFilters.set(cloneOfferFilters(this.filterModalState()));
    this.filterModalOpen.set(true);
  }

  protected closeFilterModal(): void {
    this.filterModalDraftFilters.set(null);
    this.filterModalOpen.set(false);
  }

  protected applyOfferFilters(filters: OfferFilters): void {
    const nextFilters = normalizeOfferFilters(filters);
    const nextSort = this.resolveMarketplaceSort(nextFilters.sortBy);
    const locationHandledAsync = this.applyFilterLocation(nextFilters.location);

    this.appliedOfferFilters.set(nextFilters);
    this.filterModalDraftFilters.set(null);
    this.filterModalOpen.set(false);
    this.pickupTodayOnly.set(nextFilters.pickupDay === 'today');
    this.includeUnavailable.set(!nextFilters.hideSoldOut);
    this.radiusKm.set(normalizeRadiusPresetKm(nextFilters.distanceKm));
    this.sort.set(nextSort);
    this.reconcileMapSelection();
    this.syncUrlState();

    if (!locationHandledAsync) {
      this.loadOffers();
      this.queueMapRender(true);
    }
  }

  protected updateFilterModalDraft(filters: OfferFilters): void {
    this.filterModalDraftFilters.set(cloneOfferFilters(filters));
  }

  protected openLocationPicker(): void {
    this.locationPickerOpen.set(true);
  }

  protected closeLocationPicker(): void {
    this.locationPickerOpen.set(false);
    this.syncLocationSearchFromState();
  }

  protected updateLocationSearch(value: string): void {
    this.locationSearch.set(value);
    this.locationPickerOpen.set(true);
  }

  protected selectAllCitiesFromPicker(): void {
    if (!this.allowAllCitiesSelection()) {
      this.locationError.set('Choose a city or use Current location before browsing the map.');
      return;
    }
    this.locationError.set(null);
    this.updateSelectedCity('');
    this.closeLocationPicker();
  }

  protected selectCurrentLocationFromPicker(): void {
    this.locationPickerOpen.set(false);
    this.locationSearch.set(this.currentLocationOptionLabel);
    this.requestViewerLocation();
  }

  protected selectCityFromPicker(city: string): void {
    this.locationError.set(null);
    this.updateSelectedCity(city);
    this.closeLocationPicker();
  }

  protected setViewMode(mode: MarketplaceViewMode): void {
    this.viewMode.set(mode);
    if (mode === 'MAP') {
      if (this.sort() !== 'DISTANCE') {
        this.sort.set('DISTANCE');
      }
      if (!this.viewerLocation() && !this.selectedCity()) {
        this.locationPickerOpen.set(true);
      }
      this.reconcileMapSelection();
      this.queueMapRender(true);
    } else {
      this.isFullMapMode.set(false);
    }
    this.syncUrlState();
  }

  protected onSearchInput(value: string): void {
    this.searchText.set(value);

    if (this.searchDebounceId !== null) {
      window.clearTimeout(this.searchDebounceId);
    }

    this.searchDebounceId = window.setTimeout(() => {
      this.searchDebounceId = null;
      this.syncUrlState();
      this.loadOffers();
    }, SEARCH_DEBOUNCE_MS);
  }

  protected updateSort(value: string): void {
    if (!isMarketplaceOfferSort(value)) {
      return;
    }

    this.sort.set(value);
    this.syncUrlState();
    this.loadOffers();
  }

  protected togglePickupToday(): void {
    this.pickupTodayOnly.update((currentValue) => !currentValue);
  }

  protected updateCategoryFilter(value: BrowseCategoryFilter): void {
    this.categoryFilter.set(value);
  }

  protected updatePriceFilter(value: string): void {
    if (!PRICE_FILTER_OPTIONS.some((option) => option.value === value)) {
      return;
    }

    this.priceFilter.set(value as BrowsePriceFilter);
  }

  protected toggleUnavailable(): void {
    this.includeUnavailable.update((currentValue) => !currentValue);
    this.syncUrlState();
    this.loadOffers();
  }

  protected clearQuickFilters(): void {
    if (this.searchDebounceId !== null) {
      window.clearTimeout(this.searchDebounceId);
      this.searchDebounceId = null;
    }

    this.appliedOfferFilters.set(createDefaultOfferFilters());
    this.searchText.set('');
    this.pickupTodayOnly.set(false);
    this.categoryFilter.set('ALL');
    this.priceFilter.set('ALL');
    this.includeUnavailable.set(true);
    this.selectedCity.set(null);
    this.viewerLocation.set(null);
    this.locationError.set(null);
    this.radiusKm.set(DEFAULT_RADIUS_KM);
    this.carouselStartIndex.set(0);
    this.selectedBusinessId.set(null);
    this.selectedOfferId.set(null);
    this.sort.set('DISTANCE');
    this.removeStoredViewerLocation();
    this.syncLocationSearchFromState();
    this.enforceMapScopeSelectionUi();
    this.syncUrlState();
    this.loadOffers();
    this.queueMapRender(false);
  }

  protected updateSelectedCity(value: string): void {
    const hadViewerLocation = this.viewerLocation() !== null;
    this.selectedCity.set(value || null);
    if (hadViewerLocation) {
      this.viewerLocation.set(null);
      this.locationError.set(null);
      this.removeStoredViewerLocation();
    }
    this.syncLocationSearchFromState();
    this.reconcileMapSelection();
    this.syncUrlState();
    if (hadViewerLocation) {
      this.loadOffers();
      return;
    }
    this.queueMapRender(true);
  }

  protected applyLocationSelection(value: string): void {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
      if (this.viewerLocation()) {
        this.clearViewerLocation();
        return;
      }

      this.locationError.set(null);
      this.updateSelectedCity('');
      return;
    }

    if (normalizedValue.toLowerCase() === this.currentLocationOptionLabel.toLowerCase()) {
      this.requestViewerLocation();
      return;
    }

    const matchedCity = this.cityOptions().find((option) => option.city.toLowerCase() === normalizedValue.toLowerCase());
    if (matchedCity) {
      this.locationError.set(null);
      this.updateSelectedCity(matchedCity.city);
      return;
    }

    this.locationError.set('Choose one of the available cities from the list or select Current location.');
  }

  protected updateRadiusPreset(value: string): void {
    const nextRadiusKm = normalizeRadiusPresetKm(value);
    if (nextRadiusKm === this.radiusKm()) {
      return;
    }

    this.radiusKm.set(nextRadiusKm);
    this.reconcileMapSelection();
    this.syncUrlState();
    if (this.viewerLocation()) {
      this.loadOffers();
    }
    this.queueMapRender(true);
  }

  protected onRadiusPresetChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    this.updateRadiusPreset(target.value);
  }

  protected selectBusiness(cluster: MarketplaceBusinessCluster): void {
    if (!this.viewerLocation() && !this.selectedCity()) {
      this.selectedCity.set(cluster.city || cluster.business.address.city || null);
    }
    this.carouselStartIndex.set(0);
    this.selectedBusinessId.set(cluster.business.id);
    this.selectedOfferId.set(cluster.offers[0]?.id ?? null);
    this.viewMode.set('MAP');
    this.sort.set('DISTANCE');
    this.syncUrlState();
    this.queueMapRender(true);
  }

  protected clearSelectedBusiness(): void {
    this.carouselStartIndex.set(0);
    this.selectedBusinessId.set(null);
    this.selectedOfferId.set(null);
    this.syncUrlState();
    this.queueMapRender(false);
  }

  protected toggleFullMapMode(): void {
    if (this.viewMode() !== 'MAP') {
      this.viewMode.set('MAP');
    }

    this.isFullMapMode.update((currentValue) => !currentValue);
    this.queueMapRender(this.selectedBusinessId() !== null);
  }

  protected async toggleNativeMapFullscreen(): Promise<void> {
    const fullscreenElement = document.fullscreenElement;
    const mapCanvasWrap = this.mapCanvasWrap;
    if (!mapCanvasWrap) {
      return;
    }

    if (this.isMapFullscreenElement(fullscreenElement)) {
      await document.exitFullscreen?.();
      return;
    }

    await mapCanvasWrap.requestFullscreen?.();
  }

  protected scrollFullMapCarousel(direction: 'backward' | 'forward'): void {
    const currentIndex = this.selectedBusinessCarouselStartIndex();
    const nextIndex = direction === 'forward' ? currentIndex + 1 : currentIndex - 1;
    this.carouselStartIndex.set(Math.max(nextIndex, 0));
  }

  protected previewSelectedBusinessOffer(offer: MarketplaceOfferModel): void {
    this.carouselStartIndex.set(0);
    this.selectedBusinessId.set(offer.business.id);
    this.selectedOfferId.set(offer.id);
  }

  protected focusOffer(offer: MarketplaceOfferModel): void {
    if (!this.viewerLocation() && !this.selectedCity()) {
      this.selectedCity.set(offer.pickupLocation.address.city || offer.business.address.city || null);
    }
    this.carouselStartIndex.set(0);
    this.selectedBusinessId.set(offer.business.id);
    this.selectedOfferId.set(offer.id);
    this.viewMode.set('MAP');
    if (this.sort() !== 'DISTANCE') {
      this.sort.set('DISTANCE');
    }
    this.syncUrlState();
    this.queueMapRender(true);
  }

  protected openOfferDetails(offer: MarketplaceOfferModel): void {
    void this.router.navigate(['/browse-offers', offer.id], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  protected toggleOfferInCart(offer: MarketplaceOfferModel): void {
    if (this.isOwnBusinessOffer(offer)) {
      this.notificationService.info('You cannot reserve offers from your own business.', 'Offer unavailable');
      return;
    }

    const added = this.offerCart.toggleOffer(offer.id);
    if (added) {
      this.notificationService.success(`"${offer.title}" was added to your cart.`, 'Saved for later');
      return;
    }

    this.notificationService.info(`"${offer.title}" was removed from your cart.`, 'Cart updated');
  }

  protected loginToAccount(): void {
    void this.userService.login('/browse-offers');
  }

  protected requestViewerLocation(): void {
    if (!('geolocation' in navigator)) {
      this.locationError.set('This browser does not support geolocation, so distance sorting is unavailable here.');
      return;
    }

    this.locating.set(true);
    this.locationError.set(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.ngZone.run(() => {
          const nextLocation: ViewerLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };

          this.viewerLocation.set(nextLocation);
          this.selectedCity.set(null);
          this.viewMode.set('MAP');
          this.locating.set(false);
          this.storeViewerLocation(nextLocation);
          this.syncLocationSearchFromState();
          this.syncUrlState();
          this.loadOffers();
        });
      },
      () => {
        this.ngZone.run(() => {
          this.locating.set(false);
          this.syncLocationSearchFromState();
          this.locationError.set('Location access was denied or unavailable. You can still browse manually without distance data.');
        });
      },
      {
        enableHighAccuracy: true,
        timeout: LOCATION_REQUEST_TIMEOUT_MS,
        maximumAge: 5 * 60 * 1000,
      },
    );
  }

  protected clearViewerLocation(): void {
    this.viewerLocation.set(null);
    this.locationError.set(null);
    this.removeStoredViewerLocation();
    this.syncLocationSearchFromState();
    this.enforceMapScopeSelectionUi();
    this.reconcileMapSelection();
    this.syncUrlState();
    if (this.viewMode() === 'MAP') {
      this.queueMapRender(false);
      return;
    }
    if (this.sort() === 'DISTANCE') {
      this.sort.set('PICKUP_SOONEST');
    }
    this.loadOffers();
  }

  protected isInCart(offerId: number): boolean {
    return this.offerCart.hasOffer(offerId);
  }

  protected isSelectedBusiness(businessId: number): boolean {
    return this.selectedBusinessId() === businessId;
  }

  protected isSelectedOffer(offerId: number): boolean {
    return this.selectedOfferId() === offerId;
  }

  protected isOwnBusinessOffer(offer: MarketplaceOfferModel | null): boolean {
    return !!offer && this.ownedBusinessIds().has(offer.business.id);
  }

  protected formatPrice(price: number): string {
    return `€${price.toFixed(2)}`;
  }

  protected formatCardPrice(price: number): string {
    return `€${price.toFixed(2)}`;
  }

  protected hasOfferDiscount(offer: MarketplaceOfferModel): boolean {
    return typeof offer.originalPrice === 'number' && offer.originalPrice > offer.price;
  }

  protected formatOriginalCardPrice(price: number | null): string {
    return typeof price === 'number' ? `€${price.toFixed(2)}` : '';
  }

  protected formatDistance(distanceMeters: number | null): string {
    return formatOfferDistance(distanceMeters);
  }

  protected hasRating(ratingAverage: number | null, ratingCount: number): boolean {
    return ratingAverage !== null && ratingCount > 0;
  }

  protected formatRating(ratingAverage: number | null, ratingCount: number): string | null {
    if (!this.hasRating(ratingAverage, ratingCount)) {
      return null;
    }

    const averageRating = ratingAverage ?? 0;
    return `${averageRating.toFixed(1)} (${ratingCount})`;
  }

  protected formatRatingBadge(ratingAverage: number | null, ratingCount: number): string | null {
    return formatOfferRatingValue(ratingAverage, ratingCount);
  }

  protected formatBusinessAvailability(cluster: MarketplaceBusinessCluster): string {
    const availableOffers = cluster.business.availableOfferCount;
    const unavailableOffers = cluster.business.unavailableOfferCount;
    const availableLabel = `${availableOffers} live ${availableOffers === 1 ? 'offer' : 'offers'}`;

    if (!unavailableOffers) {
      return availableLabel;
    }

    return `${availableLabel} | ${unavailableOffers} unavailable`;
  }

  protected formatAddress(address: MarketplaceBusinessSummaryModel['address']): string {
    return [address.street, address.city, address.country].filter(Boolean).join(', ');
  }

  protected mapScopeDescription(): string {
    const referencePoint = this.mapReferencePoint();
    const radiusKm = this.radiusKm();
    if (referencePoint === null) {
      return `Choose a city or use your location to scope the map to ${radiusKm} km.`;
    }

    return `Showing offers within ${radiusKm} km of ${referencePoint.label}.`;
  }

  protected isCategoryFilterActive(value: BrowseCategoryFilter): boolean {
    return this.categoryFilter() === value;
  }

  protected trackBusinessCluster(index: number, cluster: MarketplaceBusinessCluster): number {
    return cluster.business.id ?? index;
  }

  protected trackOffer(index: number, offer: MarketplaceOfferModel): number {
    return offer.id ?? index;
  }

  protected resolveClusterPreviewOffer(cluster: MarketplaceBusinessCluster): MarketplaceOfferModel | null {
    const selectedOffer = this.selectedOffer();
    if (selectedOffer && selectedOffer.business.id === cluster.business.id) {
      return selectedOffer;
    }

    return cluster.offers[0] ?? null;
  }

  private buildOfferCard(offer: MarketplaceOfferModel): OfferCardModel {
    const businessArea = this.resolveOfferBusinessAreaLabel(offer);
    const distanceMeters = this.viewerLocation() ? this.resolveOfferDistanceMeters(offer) : null;
    const ownBusinessOffer = this.isOwnBusinessOffer(offer);

    return createMarketplaceOfferCardModel(offer, {
      price: this.formatCardPrice(offer.price),
      originalPrice: this.hasOfferDiscount(offer) ? this.formatOriginalCardPrice(offer.originalPrice) : null,
      rating: this.formatRatingBadge(offer.business.ratingAverage, offer.business.ratingCount),
      pickup: formatOfferPickupWindow(offer.pickupTimeWindow),
      distance: distanceMeters === null ? null : this.formatDistance(distanceMeters),
      availabilityLabel: ownBusinessOffer ? 'Your offer' : formatOfferAvailabilityLabel(offer.quantityAvailable, offer.status),
      inCart: this.isInCart(offer.id),
      selected: this.isSelectedOffer(offer.id),
      brandMark: buildOfferBusinessMark(offer.business.name),
      businessArea,
    });
  }

  private resolveOfferBusinessAreaLabel(offer: MarketplaceOfferModel): string | null {
    const pickupStreet = offer.pickupLocation.address.street?.trim() || null;
    const businessStreet = offer.business.address.street?.trim() || null;

    if (this.selectedCity()) {
      return pickupStreet || businessStreet || offer.pickupLocation.address.city?.trim() || offer.business.address.city?.trim() || null;
    }

    return offer.pickupLocation.address.city?.trim() || offer.business.address.city?.trim() || pickupStreet || businessStreet || null;
  }

  private isOfferForToday(offer: MarketplaceOfferModel): boolean {
    const pickupFrom = new Date(offer.pickupTimeWindow.from);
    if (Number.isNaN(pickupFrom.getTime())) {
      return false;
    }

    return this.isSameCalendarDay(pickupFrom, new Date());
  }

  private computeVisibleOffers(filters: OfferFilters): MarketplaceOfferModel[] {
    const selectedBusinessId = this.selectedBusinessId();
    const normalizedFilters = normalizeOfferFilters(filters);
    const referencePoint = this.resolveReferencePointForFilters(normalizedFilters);
    let offers = selectedBusinessId === null
      ? this.offers()
      : this.offers().filter((offer) => offer.business.id === selectedBusinessId);

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

    offers = offers.filter((offer) => this.matchesOfferFilters(offer, normalizedFilters));
    return this.sortVisibleOffers(offers, normalizedFilters.sortBy);
  }

  private resolveReferencePointForFilters(filters: OfferFilters): { latitude: number; longitude: number } | null {
    const normalizedLocation = filters.location.trim();
    if (!normalizedLocation) {
      return null;
    }

    if (normalizedLocation.toLowerCase() === this.currentLocationOptionLabel.toLowerCase()) {
      const viewerLocation = this.viewerLocation();
      return viewerLocation === null
        ? null
        : {
            latitude: viewerLocation.latitude,
            longitude: viewerLocation.longitude,
          };
    }

    const matchingCity = this.cityOptions().find((option) => option.city.toLowerCase() === normalizedLocation.toLowerCase());
    return matchingCity === undefined
      ? null
      : {
          latitude: matchingCity.latitude,
          longitude: matchingCity.longitude,
        };
  }

  private matchesOfferFilters(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
    if (filters.pickupDay !== 'any' && !this.matchesPickupDayFilter(offer, filters)) {
      return false;
    }

    if (filters.pickupWindow !== 'any' && !this.matchesPickupWindowFilter(offer, filters.pickupWindow)) {
      return false;
    }

    if ((filters.pickupFrom || filters.pickupTo) && !this.matchesCustomPickupTimeFilter(offer, filters)) {
      return false;
    }

    if (filters.quickFilters.includes('availableNow') && !this.isOfferAvailableNow(offer)) {
      return false;
    }

    if (filters.categories.length && !filters.categories.includes(offer.category)) {
      return false;
    }

    if (!this.matchesPriceConstraints(offer, filters)) {
      return false;
    }

    if (!this.matchesDiscountConstraints(offer, filters)) {
      return false;
    }

    if (filters.hideSoldOut && (offer.status !== 'AVAILABLE' || offer.quantityAvailable <= 0)) {
      return false;
    }

    if (!this.matchesQuantityConstraint(offer.quantityAvailable, filters.quantityLeft)) {
      return false;
    }

    if (!this.matchesAllergenConstraints(offer, filters)) {
      return false;
    }

    return true;
  }

  private matchesPickupDayFilter(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
    const pickupFrom = this.resolveOfferPickupDate(offer);
    if (pickupFrom === null) {
      return false;
    }

    if (filters.pickupDay === 'today') {
      return this.isSameCalendarDay(pickupFrom, new Date());
    }

    if (filters.pickupDay === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return this.isSameCalendarDay(pickupFrom, tomorrow);
    }

    if (filters.pickupDay === 'custom') {
      if (!filters.pickupDate) {
        return false;
      }

      return pickupFrom.toISOString().slice(0, 10) === filters.pickupDate;
    }

    return true;
  }

  private matchesPickupWindowFilter(
    offer: MarketplaceOfferModel,
    pickupWindow: OfferFilters['pickupWindow'],
  ): boolean {
    const pickupFrom = this.resolveOfferPickupDate(offer);
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

  private matchesCustomPickupTimeFilter(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
    const pickupFrom = this.resolveOfferPickupDate(offer);
    if (pickupFrom === null) {
      return false;
    }

    const pickupMinutes = pickupFrom.getHours() * 60 + pickupFrom.getMinutes();
    const minMinutes = this.parseTimeValueToMinutes(filters.pickupFrom);
    const maxMinutes = this.parseTimeValueToMinutes(filters.pickupTo);

    if (minMinutes !== null && pickupMinutes < minMinutes) {
      return false;
    }

    if (maxMinutes !== null && pickupMinutes > maxMinutes) {
      return false;
    }

    return true;
  }

  private matchesPriceConstraints(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
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

  private matchesDiscountConstraints(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
    const discountPercentage = this.resolveOfferDiscountPercentage(offer);
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

  private matchesQuantityConstraint(
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

  private matchesAllergenConstraints(offer: MarketplaceOfferModel, filters: OfferFilters): boolean {
    if (!filters.excludedAllergens.length) {
      return true;
    }

    const excludedAllergens = filters.excludedAllergens as AllergenCode[];
    if (excludedAllergens.some((allergen) => offer.containsAllergens.includes(allergen))) {
      return false;
    }

    if (filters.excludeMayContain && excludedAllergens.some((allergen) => offer.mayContainAllergens.includes(allergen))) {
      return false;
    }

    return true;
  }

  private isOfferAvailableNow(offer: MarketplaceOfferModel): boolean {
    if (offer.status !== 'AVAILABLE' || offer.quantityAvailable <= 0) {
      return false;
    }

    const pickupFrom = this.resolveOfferPickupDate(offer);
    const pickupTo = new Date(offer.pickupTimeWindow.to);
    if (pickupFrom === null || Number.isNaN(pickupTo.getTime())) {
      return false;
    }

    const now = new Date();
    return now >= pickupFrom && now <= pickupTo;
  }

  private sortVisibleOffers(offers: MarketplaceOfferModel[], sortBy: OfferFilterSortBy): MarketplaceOfferModel[] {
    const sortableOffers = [...offers];
    switch (sortBy) {
      case 'nearest':
        return sortableOffers.sort((first, second) => {
          const firstDistance = this.resolveOfferDistanceMeters(first) ?? Number.POSITIVE_INFINITY;
          const secondDistance = this.resolveOfferDistanceMeters(second) ?? Number.POSITIVE_INFINITY;
          if (firstDistance !== secondDistance) {
            return firstDistance - secondDistance;
          }

          return first.title.localeCompare(second.title);
        });
      case 'pickupSoonest':
        return sortableOffers.sort((first, second) =>
          new Date(first.pickupTimeWindow.from).getTime() - new Date(second.pickupTimeWindow.from).getTime());
      case 'lowestPrice':
        return sortableOffers.sort((first, second) => first.price - second.price || first.title.localeCompare(second.title));
      case 'highestDiscount':
        return sortableOffers.sort((first, second) =>
          this.resolveOfferDiscountPercentage(second) - this.resolveOfferDiscountPercentage(first)
          || first.price - second.price,
        );
      case 'bestRated':
        return sortableOffers.sort((first, second) =>
          (second.business.ratingAverage ?? 0) - (first.business.ratingAverage ?? 0)
          || second.business.ratingCount - first.business.ratingCount,
        );
      default:
        return sortableOffers;
    }
  }

  private resolveOfferDiscountPercentage(offer: MarketplaceOfferModel): number {
    if (typeof offer.originalPrice !== 'number' || offer.originalPrice <= 0 || offer.originalPrice <= offer.price) {
      return 0;
    }

    return Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 100);
  }

  private resolveOfferPickupDate(offer: MarketplaceOfferModel): Date | null {
    const pickupFrom = new Date(offer.pickupTimeWindow.from);
    return Number.isNaN(pickupFrom.getTime()) ? null : pickupFrom;
  }

  private parseTimeValueToMinutes(value: string | null | undefined): number | null {
    if (!value) {
      return null;
    }

    const [hours, minutes] = value.split(':').map((segment) => Number.parseInt(segment, 10));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    return hours * 60 + minutes;
  }

  private formatOfferCardMeta(offer: MarketplaceOfferModel): string | null {
    const city = offer.pickupLocation.address.city?.trim() || offer.business.address.city?.trim() || null;
    const compactDistance = this.formatCompactDistance(this.resolveOfferDistanceMeters(offer));
    const parts = [city, compactDistance].filter((value): value is string => Boolean(value));
    return parts.length ? parts.join(' • ') : null;
  }

  private formatCompactDistance(distanceMeters: number | null): string | null {
    if (distanceMeters === null) {
      return null;
    }

    const distanceKm = Math.max(distanceMeters / 1000, 0.1);
    const fractionDigits = distanceKm < 10 ? 1 : 0;
    return `${distanceKm.toFixed(fractionDigits)} km`;
  }

  private resolveCurrentSortBy(currentSortBy: OfferFilterSortBy): OfferFilterSortBy {
    if (currentSortBy === 'bestRated' || currentSortBy === 'highestDiscount') {
      return currentSortBy;
    }

    switch (this.sort()) {
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

  private resolveMarketplaceSort(sortBy: OfferFilterSortBy): MarketplaceOfferSort {
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

  private applyFilterLocation(location: string): boolean {
    const normalizedLocation = location.trim();
    const currentLocationLabel = this.currentLocationOptionLabel.toLowerCase();

    if (!normalizedLocation) {
      if (this.viewerLocation()) {
        this.viewerLocation.set(null);
        this.locationError.set(null);
        this.removeStoredViewerLocation();
      }
      this.selectedCity.set(null);
      this.syncLocationSearchFromState();
      this.enforceMapScopeSelectionUi();
      return false;
    }

    if (normalizedLocation.toLowerCase() === currentLocationLabel) {
      if (!this.viewerLocation()) {
        this.requestViewerLocation();
        return true;
      }

      this.selectedCity.set(null);
      this.syncLocationSearchFromState();
      return false;
    }

    const matchedCity = this.cityOptions().find((option) => option.city.toLowerCase() === normalizedLocation.toLowerCase());
    if (matchedCity) {
      if (this.viewerLocation()) {
        this.viewerLocation.set(null);
        this.locationError.set(null);
        this.removeStoredViewerLocation();
      }
      this.selectedCity.set(matchedCity.city);
      this.syncLocationSearchFromState();
      return false;
    }

    return false;
  }

  private loadOffers(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    const location = this.viewerLocation();

    this.marketplaceOfferApi
      .getMarketplaceOffers({
        q: this.searchText().trim() || undefined,
        viewerLat: location?.latitude ?? null,
        viewerLng: location?.longitude ?? null,
        radiusKm: this.mapReferencePoint() ? this.radiusKm() : null,
        sort: this.sort(),
        includeUnavailable: this.includeUnavailable(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (offers) => {
          this.offers.set(offers);
          this.loading.set(false);
          this.reconcileSelection(offers);
          this.reconcileCitySelection();
          this.reconcileMapSelection();
          this.queueMapRender(false);
        },
        error: () => {
          this.offers.set([]);
          this.loading.set(false);
          this.errorMessage.set('We could not load rescue offers right now. Please try again soon.');
          this.queueMapRender(false);
        },
      });
  }

  private reconcileSelection(offers: MarketplaceOfferModel[]): void {
    const selectedBusinessId = this.selectedBusinessId();
    if (selectedBusinessId !== null && !offers.some((offer) => offer.business.id === selectedBusinessId)) {
      this.selectedBusinessId.set(null);
      this.selectedOfferId.set(null);
    }

    const selectedOfferId = this.selectedOfferId();
    if (selectedOfferId !== null && !offers.some((offer) => offer.id === selectedOfferId)) {
      this.selectedOfferId.set(null);
    }
  }

  private reconcileCitySelection(): void {
    const selectedCity = this.selectedCity();
    if (selectedCity === null) {
      return;
    }

    if (!this.cityOptions().some((option) => option.city === selectedCity)) {
      this.selectedCity.set(null);
    }
  }

  private reconcileMapSelection(): void {
    const selectedBusinessId = this.selectedBusinessId();
    if (selectedBusinessId !== null && !this.mapScopedBusinesses().some((cluster) => cluster.business.id === selectedBusinessId)) {
      this.selectedBusinessId.set(null);
      this.selectedOfferId.set(null);
    }
  }

  private readStoredViewerLocation(): ViewerLocation | null {
    const rawValue = localStorage.getItem(LOCATION_STORAGE_KEY)
      ?? localStorage.getItem(LEGACY_LOCATION_STORAGE_KEY);
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

  private storeViewerLocation(location: ViewerLocation): void {
    localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(location));
    localStorage.removeItem(LEGACY_LOCATION_STORAGE_KEY);
  }

  private removeStoredViewerLocation(): void {
    localStorage.removeItem(LOCATION_STORAGE_KEY);
    localStorage.removeItem(LEGACY_LOCATION_STORAGE_KEY);
  }

  private async initializeMap(): Promise<void> {
    if (!this.mapHost) {
      return;
    }

    if (!this.googleMapsApiKey) {
      this.mapError.set('Google Maps API key is missing. Add it to public/app-config.local.json or public/app-config.json to enable the map.');
      return;
    }

    if (!this.googleMaps) {
      try {
        this.googleMaps = await ensureGoogleMapsLoaded(this.googleMapsApiKey);
        this.mapError.set(null);
      } catch {
        this.mapError.set('The interactive map could not be loaded right now.');
        return;
      }
    }

    if (this.map) {
      this.queueMapRender(false);
      return;
    }

    this.map = new this.googleMaps.maps.Map(this.mapHost, {
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: 'greedy',
      zoomControl: false,
      styles: SAVR_MAP_STYLES,
    });
    this.infoWindow = new this.googleMaps.maps.InfoWindow({
      maxWidth: 320,
      pixelOffset: new this.googleMaps.maps.Size(0, -18),
    });

    this.queueMapRender(false);
  }

  private queueMapRender(focusSelectedBusiness: boolean): void {
    if (!this.mapHost) {
      return;
    }

    window.setTimeout(() => {
      if (!this.mapHost) {
        return;
      }

      if (!this.map) {
        void this.initializeMap();
        return;
      }

      this.renderMap(focusSelectedBusiness);
    });
  }

  private renderMap(focusSelectedBusiness: boolean): void {
    if (!this.map || !this.googleMaps) {
      return;
    }

    this.googleMaps.maps.event?.trigger(this.map, 'resize');
    this.clearMapMarkers();
    this.infoWindow?.close();

    const referencePoint = this.mapReferencePoint();
    if (referencePoint === null) {
      this.map.setCenter(DEFAULT_MAP_CENTER);
      this.map.setZoom(DEFAULT_MAP_ZOOM);
      return;
    }

    const bounds = new this.googleMaps.maps.LatLngBounds();
    let hasBounds = false;
    let pointsInBounds = 0;

    for (const cluster of this.mapScopedBusinesses()) {
      const latitude = cluster.latitude;
      const longitude = cluster.longitude;
      if (latitude === null || longitude === null) {
        continue;
      }

      const marker = this.createBusinessMarker(cluster);

      this.businessMarkers.set(cluster.business.id, marker);
      bounds.extend({ lat: latitude, lng: longitude });
      hasBounds = true;
      pointsInBounds += 1;
    }

    const viewerLocation = this.viewerLocation();
    if (viewerLocation) {
      this.viewerMarker = new this.googleMaps.maps.Marker({
        position: { lat: viewerLocation.latitude, lng: viewerLocation.longitude },
        map: this.map,
        title: 'Your location',
        zIndex: 500,
        icon: {
          url: this.viewerMarkerIcon(),
          anchor: new this.googleMaps.maps.Point(18, 18),
        },
      });

      this.viewerMarker.addListener('click', () => {
        this.infoWindow?.setContent(`
          <div class="browse-map-popup browse-map-popup--simple">
            <div class="browse-map-popup__body">
              <span class="browse-map-popup__eyebrow">Current location</span>
              <strong>Your location</strong>
            </div>
          </div>
        `);
        this.infoWindow?.open({ anchor: this.viewerMarker, map: this.map });
      });

      bounds.extend({ lat: viewerLocation.latitude, lng: viewerLocation.longitude });
      hasBounds = true;
      pointsInBounds += 1;
    }

    const selectedBusiness = this.selectedBusiness();
    if (
      focusSelectedBusiness &&
      selectedBusiness !== null &&
      selectedBusiness.latitude !== null &&
      selectedBusiness.longitude !== null
    ) {
      this.map.setCenter({ lat: selectedBusiness.latitude, lng: selectedBusiness.longitude });
      this.map.setZoom(MAP_MARKER_ZOOM);
      return;
    }

    if (!hasBounds) {
      this.map.setCenter(DEFAULT_MAP_CENTER);
      this.map.setZoom(DEFAULT_MAP_ZOOM);
      return;
    }

    if (pointsInBounds === 1) {
      const singleBusiness = this.mapScopedBusinesses()[0];
      if (singleBusiness?.latitude !== null && singleBusiness?.longitude !== null) {
        this.map.setCenter({ lat: singleBusiness.latitude, lng: singleBusiness.longitude });
        this.map.setZoom(MAP_MARKER_ZOOM);
        return;
      }

      if (viewerLocation) {
        this.map.setCenter({ lat: viewerLocation.latitude, lng: viewerLocation.longitude });
        this.map.setZoom(LOCATION_ZOOM);
      }
      return;
    }

    this.map.fitBounds(bounds, MAP_FIT_BOUNDS_PADDING);
  }

  private disposeMap(): void {
    this.clearMapMarkers();
    this.infoWindow?.close();
    this.infoWindow = null;
    this.map = null;
  }

  private syncNativeMapFullscreenState(): void {
    this.isNativeMapFullscreen.set(this.isMapFullscreenElement(document.fullscreenElement));
  }

  private isMapFullscreenElement(element: Element | null): boolean {
    if (!element) {
      return false;
    }

    const mapCanvasWrap = this.mapCanvasWrap;
    const mapHost = this.mapHost;
    return Boolean(
      (mapCanvasWrap && (element === mapCanvasWrap || element.contains(mapCanvasWrap) || mapCanvasWrap.contains(element)))
      || (mapHost && (element === mapHost || element.contains(mapHost) || mapHost.contains(element))),
    );
  }

  private clearMapMarkers(): void {
    for (const marker of this.businessMarkers.values()) {
      marker.setMap?.(null);
    }
    this.businessMarkers.clear();

    if (this.viewerMarker) {
      this.viewerMarker.setMap?.(null);
      this.viewerMarker = null;
    }
  }

  private createBusinessMarker(cluster: MarketplaceBusinessCluster): any {
    if (!this.googleMaps || !this.map || cluster.latitude === null || cluster.longitude === null) {
      return null;
    }

    const component = this;
    const position = new this.googleMaps.maps.LatLng(cluster.latitude, cluster.longitude);
    const isSelected = this.isSelectedBusiness(cluster.business.id);
    const OverlayView = this.googleMaps.maps.OverlayView;

    class BusinessMarkerOverlay extends OverlayView {
      private element: HTMLButtonElement | null = null;
      private readonly handleClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        component.ngZone.run(() => {
          component.carouselStartIndex.set(0);
          component.selectedBusinessId.set(cluster.business.id);
          component.selectedOfferId.set(component.resolveClusterPreviewOffer(cluster)?.id ?? null);
          component.queueMapRender(true);
        });
      };

      onAdd(): void {
        const panes = this['getPanes']?.();
        const overlayPane = panes?.overlayMouseTarget;
        if (!overlayPane) {
          return;
        }

        const element = document.createElement('button');
        element.type = 'button';
        element.className = `browse-map-marker${isSelected ? ' is-selected' : ''}`;
        element.title = cluster.business.name;
        const distanceLabel = component.shouldShowViewerDistance()
          ? ` ${component.formatDistance(component.resolveClusterDistanceMeters(cluster))}.`
          : '';
        element.setAttribute(
          'aria-label',
          `${cluster.business.name}. ${component.formatBusinessAvailability(cluster)}.${distanceLabel}`,
        );
        element.innerHTML = component.businessMarkerHtml(cluster);
        element.addEventListener('click', this.handleClick);
        overlayPane.appendChild(element);
        this.element = element;
      }

      draw(): void {
        const projection = this['getProjection']?.();
        const pixel = projection?.fromLatLngToDivPixel(position);
        if (!pixel || !this.element) {
          return;
        }

        this.element.style.left = `${pixel.x}px`;
        this.element.style.top = `${pixel.y}px`;
        this.element.style.zIndex = isSelected ? '500' : `${Math.round(pixel.y)}`;
      }

      onRemove(): void {
        if (!this.element) {
          return;
        }

        this.element.removeEventListener('click', this.handleClick);
        this.element.remove();
        this.element = null;
      }
    }

    const marker = new BusinessMarkerOverlay();
    marker['setMap'](this.map);
    return marker;
  }

  private businessMarkerHtml(cluster: MarketplaceBusinessCluster): string {
    const businessMark = this.escapeHtml(buildOfferBusinessMark(cluster.business.name).slice(0, 1));
    const businessIconUrl = this.resolveBusinessMarkerIcon(cluster);
    const badgeValue = cluster.business.availableOfferCount > 0 ? cluster.business.availableOfferCount : cluster.offers.length;
    const badgeLabel = badgeValue > 99 ? '99+' : String(badgeValue);

    return `
      <span class="browse-map-marker__body${businessIconUrl ? ' has-logo' : ' is-fallback'}">
        ${
          businessIconUrl
            ? `<img src="${this.escapeHtml(businessIconUrl)}" alt="" />`
            : `
              <span class="browse-map-marker__store" aria-hidden="true"></span>
              <span class="browse-map-marker__mark">${businessMark}</span>
            `
        }
      </span>
      <span class="browse-map-marker__badge">${badgeLabel}</span>
    `;
  }

  private resolveBusinessMarkerIcon(cluster: MarketplaceBusinessCluster): string | null {
    return BUSINESS_MARKER_ICON_OVERRIDES[cluster.business.id] ?? resolveBusinessIconUrl(cluster.business.iconUrl);
  }

  private viewerMarkerIcon(): string {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="18" r="14" fill="#2f8f4e" opacity="0.15"/>
        <circle cx="18" cy="18" r="10" fill="#2b78ff" opacity="0.18"/>
        <circle cx="18" cy="18" r="6.5" fill="#2b78ff" stroke="#ffffff" stroke-width="3"/>
      </svg>
    `;

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  protected resolveClusterDistanceMeters(cluster: MarketplaceBusinessCluster): number | null {
    if (cluster.distanceMeters !== null) {
      return cluster.distanceMeters;
    }

    const referencePoint = this.mapReferencePoint();
    if (referencePoint === null) {
      return null;
    }

    return resolveDistanceMeters(
      referencePoint.latitude,
      referencePoint.longitude,
      cluster.latitude,
      cluster.longitude,
    );
  }

  protected shouldShowViewerDistance(): boolean {
    return this.viewerLocation() !== null;
  }

  protected resolveOfferDistanceMeters(offer: MarketplaceOfferModel): number | null {
    if (offer.distanceMeters !== null) {
      return offer.distanceMeters;
    }

    const referencePoint = this.mapReferencePoint();
    if (referencePoint === null) {
      return null;
    }

    return resolveDistanceMeters(
      referencePoint.latitude,
      referencePoint.longitude,
      offer.pickupLocation.address.latitude ?? offer.business.address.latitude ?? null,
      offer.pickupLocation.address.longitude ?? offer.business.address.longitude ?? null,
    );
  }

  private isSameCalendarDay(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }

  private readUrlState(queryParams: ParamMap): MarketplaceUrlState {
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
    };
  }

  private applyUrlState(nextState: MarketplaceUrlState): { changed: boolean; requiresReload: boolean } {
    let changed = false;
    let requiresReload = false;

    if (this.searchDebounceId !== null && this.searchText() !== nextState.query) {
      window.clearTimeout(this.searchDebounceId);
      this.searchDebounceId = null;
    }

    if (this.searchText() !== nextState.query) {
      this.searchText.set(nextState.query);
      changed = true;
      requiresReload = true;
    }

    if (this.sort() !== nextState.sort) {
      this.sort.set(nextState.sort);
      changed = true;
      requiresReload = true;
    }

    if (this.includeUnavailable() !== nextState.includeUnavailable) {
      this.includeUnavailable.set(nextState.includeUnavailable);
      changed = true;
      requiresReload = true;
    }

    if (this.viewMode() !== nextState.view) {
      this.viewMode.set(nextState.view);
      if (nextState.view !== 'MAP') {
        this.isFullMapMode.set(false);
      }
      changed = true;
    }

    if (this.selectedCity() !== nextState.city) {
      this.selectedCity.set(nextState.city);
      changed = true;
    }

    if (this.radiusKm() !== nextState.radiusKm) {
      this.radiusKm.set(nextState.radiusKm);
      changed = true;
    }

    return { changed, requiresReload };
  }

  private syncLocationSearchFromState(): void {
    if (this.locating()) {
      this.locationSearch.set('Locating...');
      return;
    }

    if (this.viewerLocation()) {
      this.locationSearch.set(this.currentLocationOptionLabel);
      return;
    }

    this.locationSearch.set(this.selectedCity() ?? '');
  }

  private enforceMapScopeSelectionUi(): void {
    if (this.viewMode() === 'MAP' && !this.viewerLocation() && !this.selectedCity()) {
      this.locationPickerOpen.set(true);
    }
  }

  private syncUrlState(): void {
    const nextQueryParams: Record<string, string> = {};
    const searchText = this.searchText().trim();

    if (searchText) {
      nextQueryParams['q'] = searchText;
    }

    if (this.sort() !== 'DISTANCE') {
      nextQueryParams['sort'] = this.sort();
    }

    if (!this.includeUnavailable()) {
      nextQueryParams['includeUnavailable'] = 'false';
    }

    if (this.viewMode() !== 'LIST') {
      nextQueryParams['view'] = this.viewMode();
    }

    if (this.selectedCity()) {
      nextQueryParams['city'] = this.selectedCity()!;
    }

    if (this.mapReferencePoint() !== null || this.radiusKm() !== DEFAULT_RADIUS_KM) {
      nextQueryParams['radiusKm'] = String(this.radiusKm());
    }

    const currentQueryParams = { ...this.route.snapshot.queryParams } as Record<string, unknown>;
    for (const managedQueryParam of MANAGED_QUERY_PARAMS) {
      delete currentQueryParams[managedQueryParam];
    }

    const mergedQueryParams = {
      ...currentQueryParams,
      ...nextQueryParams,
    };

    const currentEntries = Object.entries(this.route.snapshot.queryParams).sort(([firstKey], [secondKey]) =>
      firstKey.localeCompare(secondKey),
    );
    const nextEntries = Object.entries(mergedQueryParams).sort(([firstKey], [secondKey]) =>
      firstKey.localeCompare(secondKey),
    );

    if (JSON.stringify(currentEntries) === JSON.stringify(nextEntries)) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: mergedQueryParams,
      replaceUrl: true,
    });
  }
}
