import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { environment } from '../../../../../environments/environment';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import {
  MarketplaceBusinessSummaryModel,
  MarketplaceOfferModel,
  MarketplaceOfferSort,
  MarketplaceViewMode,
} from '../../models/marketplace-offer.model';
import { OfferStatus, resolveOfferImage } from '../../models/offer.model';
import { MarketplaceOfferApiService } from '../../services/marketplace-offer-api.service';
import { OfferCartService } from '../../services/offer-cart.service';
import { ReservationApiService } from '../../services/reservation-api.service';

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

interface GoogleMapsApi {
  maps: {
    Map: new (element: HTMLElement, options?: Record<string, unknown>) => any;
    Marker: new (options?: Record<string, unknown>) => any;
    InfoWindow: new (options?: Record<string, unknown>) => any;
    LatLngBounds: new () => {
      extend(coordinates: { lat: number; lng: number }): void;
    };
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
const RADIUS_PRESET_OPTIONS = [5, 10, 20, 30, 50, 100] as const;
const SORT_OPTIONS: readonly MarketplaceOfferSort[] = ['DISTANCE', 'PICKUP_SOONEST', 'PRICE_ASC', 'NEWEST'];
const VIEW_MODES: readonly MarketplaceViewMode[] = ['LIST', 'MAP'];
const MANAGED_QUERY_PARAMS = ['q', 'sort', 'includeUnavailable', 'view', 'city', 'radiusKm'] as const;

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
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './browse-offers.html',
  styleUrl: './browse-offers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowseOffersPage implements OnDestroy {
  private readonly marketplaceOfferApi = inject(MarketplaceOfferApiService);
  private readonly reservationApi = inject(ReservationApiService);
  private readonly notificationInbox = inject(NotificationInboxService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);
  private readonly offerCart = inject(OfferCartService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);
  private readonly googleMapsApiKey = environment.googleMapsApiKey.trim();

  private googleMaps: GoogleMapsApi | null = null;
  private map: any | null = null;
  private infoWindow: any | null = null;
  private mapHost: HTMLDivElement | null = null;
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

  protected readonly user = this.userService.getUser();
  protected readonly icons = appIcons;
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly viewModes = VIEW_MODES;
  protected readonly radiusPresetOptions = RADIUS_PRESET_OPTIONS;
  protected readonly offers = signal<MarketplaceOfferModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly locationError = signal<string | null>(null);
  protected readonly mapError = signal<string | null>(null);
  protected readonly reservingIds = signal<number[]>([]);
  protected readonly locating = signal(false);
  protected readonly searchText = signal('');
  protected readonly selectedCity = signal<string | null>(null);
  protected readonly selectedBusinessId = signal<number | null>(null);
  protected readonly selectedOfferId = signal<number | null>(null);
  protected readonly viewMode = signal<MarketplaceViewMode>('LIST');
  protected readonly sort = signal<MarketplaceOfferSort>('DISTANCE');
  protected readonly includeUnavailable = signal(true);
  protected readonly radiusKm = signal(DEFAULT_RADIUS_KM);
  protected readonly viewerLocation = signal<ViewerLocation | null>(this.readStoredViewerLocation());

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
    const selectedBusinessId = this.selectedBusinessId();
    let offers = selectedBusinessId === null
      ? this.offers()
      : this.offers().filter((offer) => offer.business.id === selectedBusinessId);

    const referencePoint = this.mapReferencePoint();
    if (this.viewMode() === 'MAP' && referencePoint !== null) {
      const scopeRadiusMeters = this.radiusKm() * 1000;
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

      if (this.sort() === 'DISTANCE') {
        offers = [...offers].sort((first, second) => {
          const firstDistance = this.resolveOfferDistanceMeters(first) ?? Number.POSITIVE_INFINITY;
          const secondDistance = this.resolveOfferDistanceMeters(second) ?? Number.POSITIVE_INFINITY;

          if (firstDistance !== secondDistance) {
            return firstDistance - secondDistance;
          }

          return first.title.localeCompare(second.title);
        });
      }
    }

    return offers;
  });
  protected readonly selectedBusiness = computed(
    () => this.businessClusters().find((cluster) => cluster.business.id === this.selectedBusinessId()) ?? null,
  );
  protected readonly selectedOffer = computed(
    () => this.offers().find((offer) => offer.id === this.selectedOfferId()) ?? null,
  );
  protected readonly mappedBusinesses = computed(() =>
    this.businessClusters().filter((cluster) => cluster.latitude !== null && cluster.longitude !== null),
  );
  protected readonly summary = computed(() => ({
    totalOffers: this.offers().length,
    visibleOffers: this.visibleOffers().length,
    businesses: this.businessClusters().length,
    available: this.offers().filter((offer) => offer.status === 'AVAILABLE').length,
    unavailable: this.offers().filter((offer) => offer.status !== 'AVAILABLE').length,
  }));

  constructor() {
    this.applyUrlState(this.readUrlState(this.route.snapshot.queryParamMap));

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

  protected refreshOffers(): void {
    this.loadOffers();
  }

  protected setViewMode(mode: MarketplaceViewMode): void {
    this.viewMode.set(mode);
    if (mode === 'MAP') {
      if (this.sort() !== 'DISTANCE') {
        this.sort.set('DISTANCE');
      }
      this.reconcileMapSelection();
      this.queueMapRender(true);
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

  protected toggleUnavailable(): void {
    this.includeUnavailable.update((currentValue) => !currentValue);
    this.syncUrlState();
    this.loadOffers();
  }

  protected updateSelectedCity(value: string): void {
    this.selectedCity.set(value || null);
    this.reconcileMapSelection();
    this.syncUrlState();
    this.queueMapRender(true);
  }

  protected updateRadiusPreset(value: string): void {
    this.radiusKm.set(normalizeRadiusPresetKm(value));
    this.reconcileMapSelection();
    this.syncUrlState();
    this.queueMapRender(true);
  }

  protected selectBusiness(cluster: MarketplaceBusinessCluster): void {
    if (!this.viewerLocation() && !this.selectedCity()) {
      this.selectedCity.set(cluster.city || cluster.business.address.city || null);
    }
    this.selectedBusinessId.set(cluster.business.id);
    this.selectedOfferId.set(cluster.offers[0]?.id ?? null);
    this.viewMode.set('MAP');
    this.sort.set('DISTANCE');
    this.syncUrlState();
    this.queueMapRender(true);
  }

  protected clearSelectedBusiness(): void {
    this.selectedBusinessId.set(null);
    this.selectedOfferId.set(null);
    this.syncUrlState();
    this.queueMapRender(false);
  }

  protected focusOffer(offer: MarketplaceOfferModel): void {
    if (!this.viewerLocation() && !this.selectedCity()) {
      this.selectedCity.set(offer.pickupLocation.address.city || offer.business.address.city || null);
    }
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
    const added = this.offerCart.toggleOffer(offer.id);
    if (added) {
      this.notificationService.success(`"${offer.title}" was added to your cart.`, 'Saved for later');
      return;
    }

    this.notificationService.info(`"${offer.title}" was removed from your cart.`, 'Cart updated');
  }

  protected reserveOffer(offer: MarketplaceOfferModel): void {
    if (!offer.canReserve || this.isReserving(offer.id)) {
      return;
    }

    if (!this.user()) {
      void this.userService.login('/browse-offers');
      return;
    }

    this.reservingIds.update((ids) => [...ids, offer.id]);
    this.reservationApi
      .createReservation({ offerId: offer.id, quantity: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notificationService.success(`"${offer.title}" was reserved successfully.`, 'Reservation confirmed');
          this.notificationInbox.refresh();
          this.removeReservingId(offer.id);
          this.loadOffers();
        },
        error: (error: { status?: number } | undefined) => {
          this.removeReservingId(offer.id);

          if (error?.status === 401) {
            void this.userService.login('/browse-offers');
            return;
          }

          this.notificationService.error('This offer could not be reserved right now. Please refresh and try again.');
        },
      });
  }

  protected loginToReserve(): void {
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
          this.syncUrlState();
          this.loadOffers();
        });
      },
      () => {
        this.ngZone.run(() => {
          this.locating.set(false);
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

  protected isReserving(offerId: number): boolean {
    return this.reservingIds().includes(offerId);
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

  protected resolveOfferImage(offer: MarketplaceOfferModel): string {
    return resolveOfferImage(offer.imageUrl, offer.id);
  }

  protected formatPrice(price: number): string {
    return `${price.toFixed(2)} EUR`;
  }

  protected formatCardPrice(price: number): string {
    return `${price.toFixed(2)} EUR`;
  }

  protected hasOfferDiscount(offer: MarketplaceOfferModel): boolean {
    return typeof offer.originalPrice === 'number' && offer.originalPrice > offer.price;
  }

  protected formatOriginalCardPrice(price: number | null): string {
    return typeof price === 'number' ? `${price.toFixed(2)} EUR` : '';
  }

  protected offerDiscountPercent(offer: MarketplaceOfferModel): number | null {
    if (!this.hasOfferDiscount(offer) || offer.originalPrice === null) {
      return null;
    }

    return Math.round(((offer.originalPrice - offer.price) / offer.originalPrice) * 100);
  }

  protected offerDiscountBadge(offer: MarketplaceOfferModel): string | null {
    const discountPercent = this.offerDiscountPercent(offer);
    return discountPercent === null ? null : `Save ${discountPercent}%`;
  }

  protected formatDistance(distanceMeters: number | null): string {
    if (distanceMeters === null) {
      return 'Distance unavailable';
    }

    if (distanceMeters < 1000) {
      return `${Math.round(distanceMeters)} m away`;
    }

    return `${(distanceMeters / 1000).toFixed(1)} km away`;
  }

  protected formatOfferDistanceBadge(offer: MarketplaceOfferModel): string {
    const distanceMeters = this.resolveOfferDistanceMeters(offer);
    if (distanceMeters === null) {
      return offer.pickupLocation.address.city?.trim() || 'Open map';
    }

    if (distanceMeters < 1000) {
      return `${Math.round(distanceMeters)} m`;
    }

    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  protected formatRating(ratingAverage: number | null, ratingCount: number): string {
    if (ratingAverage === null || ratingCount <= 0) {
      return 'New';
    }

    return `${ratingAverage.toFixed(1)} (${ratingCount})`;
  }

  protected formatRatingBadge(ratingAverage: number | null, ratingCount: number): string {
    if (ratingAverage === null || ratingCount <= 0) {
      return 'New';
    }

    return ratingAverage.toFixed(1);
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

  protected formatOfferAddress(offer: MarketplaceOfferModel): string {
    return [
      offer.pickupLocation.address.street,
      offer.pickupLocation.address.city,
      offer.pickupLocation.address.country,
    ]
      .filter(Boolean)
      .join(', ');
  }

  protected mapScopeDescription(): string {
    const referencePoint = this.mapReferencePoint();
    const radiusKm = this.radiusKm();
    if (referencePoint === null) {
      return `Choose a city or use your location to scope the map to ${radiusKm} km.`;
    }

    return `Showing offers within ${radiusKm} km of ${referencePoint.label}.`;
  }

  protected formatOfferPickupWindow(offer: MarketplaceOfferModel): string {
    const from = new Date(offer.pickupTimeWindow.from);
    const to = new Date(offer.pickupTimeWindow.to);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return 'Pickup window unavailable';
    }

    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
    });

    const timeRange = `${timeFormatter.format(from)} - ${timeFormatter.format(to)}`;
    if (this.isSameCalendarDay(from, today)) {
      return `Today ${timeRange}`;
    }

    if (this.isSameCalendarDay(from, tomorrow)) {
      return `Tomorrow ${timeRange}`;
    }

    return `${dateFormatter.format(from)} ${timeRange}`;
  }

  protected offerCardBadge(offer: MarketplaceOfferModel): string | null {
    const explicitBadge = offer.badgeText?.trim();
    if (explicitBadge) {
      return explicitBadge;
    }

    if (offer.status !== 'AVAILABLE') {
      return this.offerStatusLabel(offer.status);
    }

    if (offer.quantityAvailable > 0 && offer.quantityAvailable <= 3) {
      return `${offer.quantityAvailable} left`;
    }

    return null;
  }

  protected offerCardActionLabel(offer: MarketplaceOfferModel): string {
    if (this.isReserving(offer.id)) {
      return 'Reserving...';
    }

    return 'View details';
  }

  protected handleOfferCardAction(offer: MarketplaceOfferModel): void {
    this.openOfferDetails(offer);
  }

  protected reserveButtonLabel(offer: MarketplaceOfferModel): string {
    if (!offer.canReserve) {
      return offer.status === 'EXPIRED' ? 'Expired' : 'Unavailable';
    }

    return this.user() ? 'Reserve now' : 'Sign in to reserve';
  }

  protected offerStatusLabel(status: OfferStatus): string {
    return status
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  protected trackBusinessCluster(index: number, cluster: MarketplaceBusinessCluster): number {
    return cluster.business.id ?? index;
  }

  protected trackOffer(index: number, offer: MarketplaceOfferModel): number {
    return offer.id ?? index;
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
        radiusKm: this.viewMode() === 'MAP' ? this.radiusKm() : null,
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

  private removeReservingId(offerId: number): void {
    this.reservingIds.update((ids) => ids.filter((currentId) => currentId !== offerId));
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
      this.mapError.set('Google Maps API key is missing. Add environment.googleMapsApiKey to enable the map.');
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
      fullscreenControl: true,
      clickableIcons: false,
      gestureHandling: 'greedy',
    });
    this.infoWindow = new this.googleMaps.maps.InfoWindow();

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

      const marker = new this.googleMaps.maps.Marker({
        position: { lat: latitude, lng: longitude },
        map: this.map,
        title: cluster.business.name,
        zIndex: this.isSelectedBusiness(cluster.business.id) ? 2 : 1,
        label: {
          text: String(cluster.business.availableOfferCount > 0 ? cluster.business.availableOfferCount : cluster.offers.length),
          color: '#ffffff',
          fontWeight: '800',
          fontSize: '14px',
        },
        icon: {
          path: this.googleMaps.maps.SymbolPath.CIRCLE,
          scale: this.isSelectedBusiness(cluster.business.id) ? 22 : 20,
          fillColor: this.isSelectedBusiness(cluster.business.id) ? '#152117' : '#2f8f4e',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      });

      marker.addListener('click', () => {
        this.ngZone.run(() => {
          this.selectedBusinessId.set(cluster.business.id);
          this.selectedOfferId.set(cluster.offers[0]?.id ?? null);
          this.openBusinessInfoWindow(marker, cluster);
          this.queueMapRender(true);
        });
      });

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
        zIndex: 3,
        label: {
          text: 'You',
          color: '#ffffff',
          fontWeight: '800',
          fontSize: '10px',
        },
        icon: {
          path: this.googleMaps.maps.SymbolPath.CIRCLE,
          scale: 16,
          fillColor: '#1f2a1f',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      });

      this.viewerMarker.addListener('click', () => {
        this.infoWindow?.setContent('<div class="browse-map-popup"><strong>Your location</strong></div>');
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
      const selectedMarker = this.businessMarkers.get(selectedBusiness.business.id);
      this.map.setCenter({ lat: selectedBusiness.latitude, lng: selectedBusiness.longitude });
      this.map.setZoom(LOCATION_ZOOM);
      if (selectedMarker) {
        this.openBusinessInfoWindow(selectedMarker, selectedBusiness);
      }
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
        this.map.setZoom(LOCATION_ZOOM);
        return;
      }

      if (viewerLocation) {
        this.map.setCenter({ lat: viewerLocation.latitude, lng: viewerLocation.longitude });
        this.map.setZoom(LOCATION_ZOOM);
      }
      return;
    }

    this.map.fitBounds(bounds, 56);
  }

  private disposeMap(): void {
    this.clearMapMarkers();
    this.infoWindow?.close();
    this.infoWindow = null;
    this.map = null;
  }

  private openBusinessInfoWindow(marker: any, cluster: MarketplaceBusinessCluster): void {
    if (!this.infoWindow) {
      return;
    }

    this.infoWindow.setContent(this.markerPopupHtml(cluster));
    this.infoWindow.open({ anchor: marker, map: this.map });
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

  private markerPopupHtml(cluster: MarketplaceBusinessCluster): string {
    const businessName = this.escapeHtml(cluster.business.name);
    const availability = this.escapeHtml(this.formatBusinessAvailability(cluster));
    const distance = this.escapeHtml(this.formatDistance(this.resolveClusterDistanceMeters(cluster)));

    return `
      <div class="browse-map-popup">
        <strong>${businessName}</strong>
        <span>${availability}</span>
        <span>${distance}</span>
      </div>
    `;
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

    if (this.radiusKm() !== DEFAULT_RADIUS_KM) {
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
