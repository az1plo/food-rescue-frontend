import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  HostListener,
  inject,
  NgZone,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { RouterLink } from '@angular/router';
import { runtimeConfig } from '../../../../core/config/runtime-config';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { resolveBusinessIconUrl } from '../../../../shared/models/business.model';
import { OfferCardComponent } from '../../../../shared/ui/offer-card/offer-card';
import { buildOfferBusinessMark } from '../../../../shared/ui/offer-card/offer-card.utils';
import { OfferFilterModalComponent } from './components/offer-filter-modal/offer-filter-modal.component';
import { OfferFilters } from './components/offer-filter-modal/offer-filter-modal.models';
import { MarketplaceOfferModel, MarketplaceViewMode } from '../../models/marketplace-offer.model';
import { BrowseOffersFacade } from './browse-offers.facade';
import {
  BUSINESS_MARKER_ICON_OVERRIDES,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  GoogleMapsApi,
  LOCATION_ZOOM,
  MAP_FIT_BOUNDS_PADDING,
  MAP_MARKER_ZOOM,
  MarketplaceBusinessCluster,
  RADIUS_PRESET_OPTIONS,
  SAVR_MAP_STYLES,
  VIEW_MODES,
} from './browse-offers.models';
import { escapeHtml } from './utils/browse-offers.utils';

const GOOGLE_MAPS_SCRIPT_ID = 'savr-google-maps-script';

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
    const existingScript = document.getElementById(
      GOOGLE_MAPS_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        const loadedGoogleMaps = currentGoogleMapsApi();
        if (loadedGoogleMaps) {
          resolve(loadedGoogleMaps);
          return;
        }

        reject(new Error('Google Maps loaded without exposing a global API.'));
      });
      existingScript.addEventListener('error', () =>
        reject(new Error('Google Maps could not be loaded.')),
      );
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

@Component({
  selector: 'app-browse-offers-page',
  imports: [
    FontAwesomeModule,
    RouterLink,
    ActionButtonComponent,
    OfferCardComponent,
    OfferFilterModalComponent,
  ],
  templateUrl: './browse-offers.html',
  styleUrl: './browse-offers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BrowseOffersFacade],
})
export class BrowseOffersPage implements OnDestroy {
  private readonly facade = inject(BrowseOffersFacade);
  private readonly ngZone = inject(NgZone);
  private readonly googleMapsApiKey = runtimeConfig.googleMapsApiKey;

  private googleMaps: GoogleMapsApi | null = null;
  private map: any | null = null;
  private infoWindow: any | null = null;
  private mapHost: HTMLDivElement | null = null;
  private mapCanvasWrap: HTMLDivElement | null = null;
  private businessMarkers = new Map<number, any>();
  private viewerMarker: any | null = null;

  protected readonly icons = appIcons;
  protected readonly loadingSkeletonIds = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  protected readonly viewModes = VIEW_MODES;
  protected readonly radiusPresetOptions = RADIUS_PRESET_OPTIONS;
  protected readonly mapError = signal<string | null>(null);

  protected readonly user = this.facade.user;
  protected readonly cartCount = this.facade.cartCount;
  protected readonly loading = this.facade.loading;
  protected readonly errorMessage = this.facade.errorMessage;
  protected readonly locationError = this.facade.locationError;
  protected readonly searchText = this.facade.searchText;
  protected readonly filterModalOpen = this.facade.filterModalOpen;
  protected readonly filterModalState = this.facade.filterModalState;
  protected readonly filterModalResultCount = this.facade.filterModalResultCount;
  protected readonly selectedCity = this.facade.selectedCity;
  protected readonly selectedBusiness = this.facade.selectedBusiness;
  protected readonly viewMode = this.facade.viewMode;
  protected readonly isFullMapMode = this.facade.isFullMapMode;
  protected readonly isNativeMapFullscreen = this.facade.isNativeMapFullscreen;
  protected readonly radiusKm = this.facade.radiusKm;
  protected readonly viewerLocation = this.facade.viewerLocation;
  protected readonly locationPickerOpen = this.facade.locationPickerOpen;
  protected readonly locationSearch = this.facade.locationSearch;
  protected readonly currentLocationOptionLabel = this.facade.currentLocationOptionLabel;
  protected readonly filterLocationOptions = this.facade.filterLocationOptions;
  protected readonly allowAllCitiesSelection = this.facade.allowAllCitiesSelection;
  protected readonly locationPlaceholder = this.facade.locationPlaceholder;
  protected readonly filteredCityOptions = this.facade.filteredCityOptions;
  protected readonly resultsHeadline = this.facade.resultsHeadline;
  protected readonly hasVisibleOffers = this.facade.hasVisibleOffers;
  protected readonly visibleOfferCards = this.facade.visibleOfferCards;
  protected readonly nextRadiusKm = this.facade.nextRadiusKm;
  protected readonly canExpandRadius = this.facade.canExpandRadius;
  protected readonly emptyResultsTitle = this.facade.emptyResultsTitle;
  protected readonly emptyResultsMessage = this.facade.emptyResultsMessage;
  protected readonly mapEmptyTitle = this.facade.mapEmptyTitle;
  protected readonly mapEmptyMessage = this.facade.mapEmptyMessage;
  protected readonly activeFilterCount = this.facade.activeFilterCount;
  protected readonly mapReferencePoint = this.facade.mapReferencePoint;
  protected readonly mapScopeRequired = this.facade.mapScopeRequired;
  protected readonly mapScopedBusinesses = this.facade.mapScopedBusinesses;
  protected readonly selectedBusinessOfferCards = this.facade.selectedBusinessOfferCards;
  protected readonly selectedBusinessCarouselOfferCards =
    this.facade.selectedBusinessCarouselOfferCards;
  protected readonly canScrollCarouselBackward = this.facade.canScrollCarouselBackward;
  protected readonly canScrollCarouselForward = this.facade.canScrollCarouselForward;
  protected readonly selectedBusinessCarouselRangeLabel =
    this.facade.selectedBusinessCarouselRangeLabel;
  protected readonly shouldShowFullMapCarousel = this.facade.shouldShowFullMapCarousel;
  protected readonly isImmersiveMapMode = this.facade.isImmersiveMapMode;

  private readonly mapRenderEffect = effect(() => {
    const request = this.facade.mapRenderRequest();
    if (!request) {
      return;
    }

    this.queueMapRender(request.focusSelectedBusiness);
  });

  @ViewChild('mapHost')
  private set mapHostElement(elementRef: ElementRef<HTMLDivElement> | undefined) {
    const nextHost = elementRef?.nativeElement ?? null;
    const hostChanged = this.mapHost !== nextHost;

    if (hostChanged && this.mapHost) {
      this.disposeMap();
    }

    this.mapHost = nextHost;
    if (this.mapHost) {
      void this.initializeMap(this.facade.selectedBusinessId() !== null);
    }
  }

  @ViewChild('mapCanvasWrap')
  private set mapCanvasWrapElement(elementRef: ElementRef<HTMLDivElement> | undefined) {
    this.mapCanvasWrap = elementRef?.nativeElement ?? null;
    this.syncNativeMapFullscreenState();
  }

  ngOnDestroy(): void {
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
    this.facade.refreshOffers();
  }

  protected expandRadius(): void {
    this.facade.expandRadius();
  }

  protected openFilterModal(): void {
    this.facade.openFilterModal();
  }

  protected closeFilterModal(): void {
    this.facade.closeFilterModal();
  }

  protected applyOfferFilters(filters: OfferFilters): void {
    this.facade.applyOfferFilters(filters);
  }

  protected updateFilterModalDraft(filters: OfferFilters): void {
    this.facade.updateFilterModalDraft(filters);
  }

  protected openLocationPicker(): void {
    this.facade.openLocationPicker();
  }

  protected closeLocationPicker(): void {
    this.facade.closeLocationPicker();
  }

  protected updateLocationSearch(value: string): void {
    this.facade.updateLocationSearch(value);
  }

  protected selectAllCitiesFromPicker(): void {
    this.facade.selectAllCitiesFromPicker();
  }

  protected selectCurrentLocationFromPicker(): void {
    this.facade.selectCurrentLocationFromPicker();
  }

  protected selectCityFromPicker(city: string): void {
    this.facade.selectCityFromPicker(city);
  }

  protected setViewMode(mode: MarketplaceViewMode): void {
    this.facade.setViewMode(mode);
  }

  protected onSearchInput(value: string): void {
    this.facade.onSearchInput(value);
  }

  protected clearQuickFilters(): void {
    this.facade.clearQuickFilters();
  }

  protected onRadiusPresetChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    this.facade.updateRadiusPreset(target.value);
  }

  protected clearSelectedBusiness(): void {
    this.facade.clearSelectedBusiness();
  }

  protected toggleFullMapMode(): void {
    this.facade.toggleFullMapMode();
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
    this.facade.scrollFullMapCarousel(direction);
  }

  protected previewSelectedBusinessOffer(offer: MarketplaceOfferModel): void {
    this.facade.previewSelectedBusinessOffer(offer);
  }

  protected focusOffer(offer: MarketplaceOfferModel): void {
    this.facade.focusOffer(offer);
  }

  protected openOfferDetails(offer: MarketplaceOfferModel): void {
    this.facade.openOfferDetails(offer);
  }

  protected toggleOfferInCart(offer: MarketplaceOfferModel): void {
    this.facade.toggleOfferInCart(offer);
  }

  protected loginToAccount(): void {
    this.facade.loginToAccount();
  }

  protected formatRating(ratingAverage: number | null, ratingCount: number): string | null {
    return this.facade.formatRating(ratingAverage, ratingCount);
  }

  protected formatBusinessAvailability(cluster: MarketplaceBusinessCluster): string {
    return this.facade.formatBusinessAvailability(cluster);
  }

  protected formatAddress(address: MarketplaceBusinessCluster['business']['address']): string {
    return this.facade.formatAddress(address);
  }

  protected formatDistance(distanceMeters: number | null): string {
    return this.facade.formatDistance(distanceMeters);
  }

  protected isOwnBusinessOffer(offer: MarketplaceOfferModel | null): boolean {
    return this.facade.isOwnBusinessOffer(offer);
  }

  protected shouldShowViewerDistance(): boolean {
    return this.facade.shouldShowViewerDistance();
  }

  protected resolveClusterDistanceMeters(cluster: MarketplaceBusinessCluster): number | null {
    return this.facade.resolveClusterDistanceMeters(cluster);
  }

  private async initializeMap(focusSelectedBusiness = false): Promise<void> {
    if (!this.mapHost) {
      return;
    }

    if (!this.googleMapsApiKey) {
      this.mapError.set(
        'Google Maps API key is missing. Add it to public/app-config.local.json or public/app-config.json to enable the map.',
      );
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
      this.queueMapRender(focusSelectedBusiness);
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

    this.queueMapRender(focusSelectedBusiness);
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
        void this.initializeMap(focusSelectedBusiness);
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

    const referencePoint = this.facade.mapReferencePoint();
    if (referencePoint === null) {
      this.map.setCenter(DEFAULT_MAP_CENTER);
      this.map.setZoom(DEFAULT_MAP_ZOOM);
      return;
    }

    const bounds = new this.googleMaps.maps.LatLngBounds();
    let hasBounds = false;
    let pointsInBounds = 0;

    for (const cluster of this.facade.mapScopedBusinesses()) {
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

    const viewerLocation = this.facade.viewerLocation();
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

    const selectedBusiness = this.facade.selectedBusiness();
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
      const singleBusiness = this.facade.mapScopedBusinesses()[0];
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
    this.facade.setNativeMapFullscreen(this.isMapFullscreenElement(document.fullscreenElement));
  }

  private isMapFullscreenElement(element: Element | null): boolean {
    if (!element) {
      return false;
    }

    const mapCanvasWrap = this.mapCanvasWrap;
    const mapHost = this.mapHost;
    return Boolean(
      (mapCanvasWrap &&
        (element === mapCanvasWrap ||
          element.contains(mapCanvasWrap) ||
          mapCanvasWrap.contains(element))) ||
      (mapHost && (element === mapHost || element.contains(mapHost) || mapHost.contains(element))),
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
    const isSelected = this.facade.isSelectedBusiness(cluster.business.id);
    const OverlayView = this.googleMaps.maps.OverlayView;

    class BusinessMarkerOverlay extends OverlayView {
      private element: HTMLButtonElement | null = null;
      private readonly handleClick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        component.ngZone.run(() => {
          component.facade.selectBusinessFromMap(cluster);
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
        const distanceLabel = component.facade.shouldShowViewerDistance()
          ? ` ${component.facade.formatDistance(component.facade.resolveClusterDistanceMeters(cluster))}.`
          : '';
        element.setAttribute(
          'aria-label',
          `${cluster.business.name}. ${component.facade.formatBusinessAvailability(cluster)}.${distanceLabel}`,
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
    const businessMark = escapeHtml(buildOfferBusinessMark(cluster.business.name).slice(0, 1));
    const businessIconUrl = this.resolveBusinessMarkerIcon(cluster);
    const badgeValue =
      cluster.business.availableOfferCount > 0
        ? cluster.business.availableOfferCount
        : cluster.offers.length;
    const badgeLabel = badgeValue > 99 ? '99+' : String(badgeValue);

    return `
      <span class="browse-map-marker__body${businessIconUrl ? ' has-logo' : ' is-fallback'}">
        ${
          businessIconUrl
            ? `<img src="${escapeHtml(businessIconUrl)}" alt="" />`
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
    return (
      BUSINESS_MARKER_ICON_OVERRIDES[cluster.business.id] ??
      resolveBusinessIconUrl(cluster.business.iconUrl)
    );
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
}
