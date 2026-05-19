import { computed, DestroyRef, inject, Injectable, NgZone, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { BusinessWorkspaceStateService } from '../../../../core/services/business-workspace-state.service';
import { MarketplaceOfferApiService } from '../../../../core/services/marketplace-offer-api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { OfferCartService } from '../../../../core/services/offer-cart.service';
import { formatOfferDistance } from '../../../../shared/ui/offer-card/offer-card.utils';
import { UserService } from '../../../../core/services/user.service';
import {
  cloneOfferFilters,
  createDefaultOfferFilters,
  normalizeOfferFilters,
  OfferFilters,
} from './components/offer-filter-modal/offer-filter-modal.models';
import {
  MarketplaceOfferModel,
  MarketplaceOfferSort,
  MarketplaceViewMode,
} from '../../models/marketplace-offer.model';
import {
  BrowseCategoryFilter,
  BrowsePriceFilter,
  DEFAULT_RADIUS_KM,
  FULL_MAP_CAROUSEL_LIMIT,
  MapScopeOption,
  MarketplaceBusinessCluster,
  MAX_RADIUS_KM,
  RADIUS_PRESET_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  ViewerLocation,
} from './browse-offers.models';
import {
  buildBusinessClusters,
  buildCityOptions,
  formatAddress,
  formatBusinessAvailability,
  formatRating,
  normalizeRadiusPresetKm,
  readUrlState,
  resolveDistanceMeters,
} from './utils/browse-offers.utils';
import {
  buildBrowseOfferCard,
  resolveClusterDistanceMeters,
  resolveClusterPreviewOffer,
  resolveOfferDistanceMeters,
} from './utils/browse-offers-card.utils';
import {
  buildCarouselRangeLabel,
  buildEmptyResultsMessage,
  buildEmptyResultsTitle,
  buildMapEmptyMessage,
  buildMapEmptyTitle,
  buildResultsHeadline,
  filterCityOptions,
} from './utils/browse-offers-copy.utils';
import {
  computeVisibleOffers,
  countActiveOfferFilters,
  resolveCurrentSortBy,
  resolveMarketplaceSort,
} from './browse-offers-filter.utils';
import {
  readStoredViewerLocation,
  removeStoredViewerLocation,
  resolveFilterLocationAction,
  resolveLocationSearchValue,
  resolveSelectedCityUpdate,
  shouldOpenMapScopeSelection,
  storeViewerLocation,
} from './location/browse-offers-location.utils';
import {
  buildBrowseOffersQueryParams,
  BrowseOffersUrlSnapshot,
  haveSameQueryParams,
  resolveBrowseOffersUrlStateTransition,
} from './browse-offers-url-state.utils';
import {
  BrowseOffersMapRenderRequest,
  createBrowseOffersMapRenderRequest,
  resolveReconciledMapSelection,
} from './browse-offers-map-selection.utils';
import { BrowseOffersGeolocationService } from './location/browse-offers-geolocation.service';

@Injectable()
export class BrowseOffersFacade {
  private readonly marketplaceOfferApi = inject(MarketplaceOfferApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly offerCart = inject(OfferCartService);
  private readonly geolocation = inject(BrowseOffersGeolocationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ngZone = inject(NgZone);

  private searchDebounceId: number | null = null;
  private nextMapRenderRequestId = 0;

  readonly user = this.userService.getUser();
  readonly ownedBusinessIds = computed(
    () => new Set(this.businessWorkspaceState.knownBusinesses().map((business) => business.id)),
  );
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly locationError = signal<string | null>(null);
  readonly locating = signal(false);
  readonly searchText = signal('');
  readonly filterModalOpen = signal(false);
  readonly filterModalDraftFilters = signal<OfferFilters | null>(null);
  readonly pickupTodayOnly = signal(false);
  readonly categoryFilter = signal<BrowseCategoryFilter>('ALL');
  readonly priceFilter = signal<BrowsePriceFilter>('ALL');
  readonly appliedOfferFilters = signal<OfferFilters>(createDefaultOfferFilters());
  readonly selectedCity = signal<string | null>(null);
  readonly selectedCityScope = signal<MapScopeOption | null>(null);
  readonly selectedBusinessId = signal<number | null>(null);
  readonly selectedOfferId = signal<number | null>(null);
  readonly viewMode = signal<MarketplaceViewMode>('LIST');
  readonly isFullMapMode = signal(false);
  readonly isNativeMapFullscreen = signal(false);
  readonly carouselStartIndex = signal(0);
  readonly sort = signal<MarketplaceOfferSort>('DISTANCE');
  readonly includeUnavailable = signal(true);
  readonly radiusKm = signal(DEFAULT_RADIUS_KM);
  readonly viewerLocation = signal<ViewerLocation | null>(readStoredViewerLocation());
  readonly cartCount = this.offerCart.count;
  readonly locationPickerOpen = signal(false);
  readonly locationSearch = signal('');
  readonly currentLocationOptionLabel = 'Current location';
  readonly offers = signal<MarketplaceOfferModel[]>([]);
  readonly mapRenderRequest = signal<BrowseOffersMapRenderRequest | null>(null);

  readonly filterLocationOptions = computed(() => {
    const options = new Set<string>([this.currentLocationOptionLabel]);
    for (const option of this.cityOptions()) {
      options.add(option.city);
    }
    return Array.from(options);
  });

  readonly filterModalState = computed<OfferFilters>(() => {
    const nextFilters = cloneOfferFilters(this.appliedOfferFilters());
    nextFilters.location = this.viewerLocation()
      ? this.currentLocationOptionLabel
      : (this.selectedCity() ?? '');
    nextFilters.distanceKm = this.radiusKm();
    nextFilters.hideSoldOut = !this.includeUnavailable();
    nextFilters.pickupDay = this.pickupTodayOnly()
      ? 'today'
      : nextFilters.pickupDay === 'today'
        ? 'any'
        : nextFilters.pickupDay;
    nextFilters.sortBy = resolveCurrentSortBy(nextFilters.sortBy, this.sort());
    nextFilters.quickFilters = this.resolveDerivedQuickFilters(nextFilters);
    return nextFilters;
  });

  readonly allowAllCitiesSelection = computed(() => this.viewMode() !== 'MAP');
  readonly locationPlaceholder = computed(() =>
    this.allowAllCitiesSelection() ? 'All cities' : 'Choose city or current location',
  );

  readonly filteredCityOptions = computed(() => {
    return filterCityOptions(
      this.cityOptions(),
      this.locationSearch(),
      this.viewerLocation(),
      this.currentLocationOptionLabel,
      this.selectedCity(),
      this.locating(),
    );
  });

  readonly businessClusters = computed<MarketplaceBusinessCluster[]>(() =>
    buildBusinessClusters(this.offers()),
  );
  readonly cityOptions = computed<MapScopeOption[]>(() =>
    buildCityOptions(this.businessClusters()),
  );
  readonly activeCityOption = computed(
    () => {
      const selectedCity = this.selectedCity();
      if (selectedCity === null) {
        return null;
      }

      const matchingCityOption =
        this.cityOptions().find((option) => option.city === selectedCity) ?? null;
      if (matchingCityOption !== null) {
        return matchingCityOption;
      }

      const rememberedCityScope = this.selectedCityScope();
      return rememberedCityScope?.city === selectedCity ? rememberedCityScope : null;
    },
  );

  readonly mapReferencePoint = computed(() => {
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

  readonly mapScopeRequired = computed(
    () => this.viewMode() === 'MAP' && this.mapReferencePoint() === null,
  );
  readonly mappedBusinesses = computed(() =>
    this.businessClusters().filter(
      (cluster) => cluster.latitude !== null && cluster.longitude !== null,
    ),
  );
  readonly mapScopedBusinesses = computed(() => {
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

  readonly visibleOffers = computed(() =>
    computeVisibleOffers(this.filterModalState(), {
      offers: this.offers(),
      selectedBusinessId: this.selectedBusinessId(),
      viewerLocation: this.viewerLocation(),
      currentLocationOptionLabel: this.currentLocationOptionLabel,
      cityOptions: this.cityOptions(),
      resolveOfferDistanceMeters: (offer) => this.resolveOfferDistanceMeters(offer),
    }),
  );
  readonly visibleOfferCards = computed(() =>
    this.visibleOffers().map((offer) => ({
      offer,
      card: this.toOfferCard(offer),
    })),
  );

  readonly selectedBusiness = computed(
    () =>
      this.businessClusters().find(
        (cluster) => cluster.business.id === this.selectedBusinessId(),
      ) ?? null,
  );
  readonly selectedOffer = computed(
    () => this.offers().find((offer) => offer.id === this.selectedOfferId()) ?? null,
  );
  readonly isSplitMapLayout = computed(() => this.viewMode() === 'MAP' && !this.isFullMapMode());
  readonly isImmersiveMapMode = computed(
    () => this.viewMode() === 'MAP' && (this.isFullMapMode() || this.isNativeMapFullscreen()),
  );

  readonly selectedBusinessOffers = computed<MarketplaceOfferModel[]>(() => {
    const selectedBusinessId = this.selectedBusinessId();
    if (selectedBusinessId === null) {
      return [];
    }

    const matchingOffers = this.offers().filter(
      (offer) => offer.business.id === selectedBusinessId,
    );
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

  readonly selectedBusinessOfferCards = computed(() =>
    this.selectedBusinessOffers().map((offer) => ({
      offer,
      card: this.toOfferCard(offer),
    })),
  );

  readonly selectedBusinessCarouselStartIndex = computed(() =>
    Math.min(
      this.carouselStartIndex(),
      Math.max(this.selectedBusinessOfferCards().length - FULL_MAP_CAROUSEL_LIMIT, 0),
    ),
  );
  readonly selectedBusinessCarouselOfferCards = computed(() => {
    const startIndex = this.selectedBusinessCarouselStartIndex();
    return this.selectedBusinessOfferCards().slice(
      startIndex,
      startIndex + FULL_MAP_CAROUSEL_LIMIT,
    );
  });
  readonly canScrollCarouselBackward = computed(
    () => this.selectedBusinessCarouselStartIndex() > 0,
  );
  readonly canScrollCarouselForward = computed(
    () =>
      this.selectedBusinessCarouselStartIndex() + this.selectedBusinessCarouselOfferCards().length <
      this.selectedBusinessOfferCards().length,
  );
  readonly selectedBusinessCarouselRangeLabel = computed(() => {
    return buildCarouselRangeLabel(
      this.selectedBusinessOfferCards().length,
      this.selectedBusinessCarouselStartIndex(),
      this.selectedBusinessCarouselOfferCards().length,
    );
  });

  readonly shouldShowFullMapCarousel = computed(
    () => this.isImmersiveMapMode() && this.selectedBusinessCarouselOfferCards().length > 0,
  );

  readonly filterModalResultCount = computed(() => {
    const draftFilters = this.filterModalDraftFilters();
    if (draftFilters === null) {
      return this.visibleOffers().length;
    }

    return computeVisibleOffers(draftFilters, {
      offers: this.offers(),
      selectedBusinessId: this.selectedBusinessId(),
      viewerLocation: this.viewerLocation(),
      currentLocationOptionLabel: this.currentLocationOptionLabel,
      cityOptions: this.cityOptions(),
      resolveOfferDistanceMeters: (offer) => this.resolveOfferDistanceMeters(offer),
    }).length;
  });

  readonly nextRadiusKm = computed(() => {
    const currentRadiusKm = this.radiusKm();
    const nextPresetRadiusKm = RADIUS_PRESET_OPTIONS.find((option) => option > currentRadiusKm);
    return nextPresetRadiusKm ?? Math.min(MAX_RADIUS_KM, currentRadiusKm * 2);
  });

  readonly canExpandRadius = computed(
    () => this.mapReferencePoint() !== null && this.nextRadiusKm() > this.radiusKm(),
  );

  readonly activeFilterCount = computed(() =>
    countActiveOfferFilters(this.filterModalState()),
  );

  readonly hasActiveFilters = computed(
    () =>
      Boolean(this.searchText().trim()) ||
      this.selectedCity() !== null ||
      this.viewerLocation() !== null ||
      this.activeFilterCount() > 0 ||
      this.selectedBusinessId() !== null,
  );

  readonly resultsHeadline = computed(() =>
    buildResultsHeadline(this.visibleOffers().length, this.viewerLocation(), this.selectedCity()),
  );

  readonly hasVisibleOffers = computed(() => this.visibleOffers().length > 0);
  readonly emptyResultsTitle = computed(() =>
    buildEmptyResultsTitle(
      this.selectedBusiness()?.business.name ?? null,
      this.viewerLocation(),
      this.selectedCity(),
      this.radiusKm(),
    ),
  );
  readonly emptyResultsMessage = computed(() => buildEmptyResultsMessage(this.viewMode()));
  readonly mapEmptyTitle = computed(() =>
    buildMapEmptyTitle(this.viewerLocation(), this.selectedCity()),
  );
  readonly mapEmptyMessage = computed(() =>
    buildMapEmptyMessage(
      this.viewerLocation(),
      this.selectedCity(),
      this.radiusKm(),
      this.nextRadiusKm(),
    ),
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.clearSearchDebounce();
    });

    this.applyUrlState(readUrlState(this.route.snapshot.queryParamMap));
    this.syncLocationSearchFromState();
    this.enforceMapScopeSelectionUi();

    if (!this.route.snapshot.queryParamMap.has('view') && this.viewerLocation()) {
      this.viewMode.set('MAP');
    }

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((queryParams) => {
      const outcome = this.applyUrlState(readUrlState(queryParams));
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
      this.requestMapRender(true);
    });

    this.syncUrlState();
    this.loadOffers();
  }

  refreshOffers(): void {
    this.loadOffers();
  }

  expandRadius(): void {
    if (!this.canExpandRadius()) {
      return;
    }

    this.radiusKm.set(this.nextRadiusKm());
    this.reconcileMapSelection();
    this.syncUrlState();
    if (this.mapReferencePoint()) {
      this.loadOffers();
      return;
    }
    this.requestMapRender(true);
  }

  openFilterModal(): void {
    this.filterModalDraftFilters.set(cloneOfferFilters(this.filterModalState()));
    this.filterModalOpen.set(true);
  }

  closeFilterModal(): void {
    this.filterModalDraftFilters.set(null);
    this.filterModalOpen.set(false);
  }

  applyOfferFilters(filters: OfferFilters): void {
    const nextFilters = normalizeOfferFilters(filters);
    const nextSort = resolveMarketplaceSort(nextFilters.sortBy);
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
      this.requestMapRender(true);
    }
  }

  updateFilterModalDraft(filters: OfferFilters): void {
    this.filterModalDraftFilters.set(cloneOfferFilters(filters));
  }

  openLocationPicker(): void {
    this.locationPickerOpen.set(true);
  }

  closeLocationPicker(): void {
    this.locationPickerOpen.set(false);
    this.syncLocationSearchFromState();
  }

  updateLocationSearch(value: string): void {
    if (
      this.viewerLocation() &&
      this.locationSearch() === this.currentLocationOptionLabel &&
      value !== this.currentLocationOptionLabel
    ) {
      this.clearCurrentLocationSelectionForEditing();
      return;
    }

    this.locationSearch.set(value);
    this.locationPickerOpen.set(true);
  }

  selectAllCitiesFromPicker(): void {
    if (!this.allowAllCitiesSelection()) {
      this.locationError.set('Choose a city or use Current location before browsing the map.');
      return;
    }

    this.locationError.set(null);
    this.updateSelectedCity('');
    this.closeLocationPicker();
  }

  selectCurrentLocationFromPicker(): void {
    this.locationPickerOpen.set(false);
    this.locationSearch.set(this.currentLocationOptionLabel);
    this.requestViewerLocation();
  }

  selectCityFromPicker(city: string): void {
    this.locationError.set(null);
    this.updateSelectedCity(city);
    this.closeLocationPicker();
  }

  setViewMode(mode: MarketplaceViewMode): void {
    this.viewMode.set(mode);
    if (mode === 'MAP') {
      if (this.sort() !== 'DISTANCE') {
        this.sort.set('DISTANCE');
      }
      if (!this.viewerLocation() && !this.selectedCity()) {
        this.locationPickerOpen.set(true);
      }
      this.reconcileMapSelection();
      this.requestMapRender(true);
    } else {
      this.isFullMapMode.set(false);
    }
    this.syncUrlState();
  }

  onSearchInput(value: string): void {
    this.searchText.set(value);
    this.clearSearchDebounce();

    this.searchDebounceId = window.setTimeout(() => {
      this.searchDebounceId = null;
      this.syncUrlState();
      this.loadOffers();
    }, SEARCH_DEBOUNCE_MS);
  }

  clearQuickFilters(): void {
    this.clearSearchDebounce();
    this.appliedOfferFilters.set(createDefaultOfferFilters());
    this.searchText.set('');
    this.pickupTodayOnly.set(false);
    this.categoryFilter.set('ALL');
    this.priceFilter.set('ALL');
    this.includeUnavailable.set(true);
    this.selectedCity.set(null);
    this.selectedCityScope.set(null);
    this.viewerLocation.set(null);
    this.locationError.set(null);
    this.radiusKm.set(DEFAULT_RADIUS_KM);
    this.carouselStartIndex.set(0);
    this.selectedBusinessId.set(null);
    this.selectedOfferId.set(null);
    this.sort.set('DISTANCE');
    removeStoredViewerLocation();
    this.syncLocationSearchFromState();
    this.enforceMapScopeSelectionUi();
    this.syncUrlState();
    this.loadOffers();
    this.requestMapRender(false);
  }

  updateRadiusPreset(value: string): void {
    const nextRadiusKm = normalizeRadiusPresetKm(value);
    if (nextRadiusKm === this.radiusKm()) {
      return;
    }

    this.radiusKm.set(nextRadiusKm);
    this.reconcileMapSelection();
    this.syncUrlState();
    if (this.mapReferencePoint()) {
      this.loadOffers();
      return;
    }
    this.requestMapRender(true);
  }

  clearSelectedBusiness(): void {
    this.carouselStartIndex.set(0);
    this.selectedBusinessId.set(null);
    this.selectedOfferId.set(null);
    this.syncUrlState();
    this.requestMapRender(false);
  }

  toggleFullMapMode(): void {
    if (this.viewMode() !== 'MAP') {
      this.viewMode.set('MAP');
    }

    this.isFullMapMode.update((currentValue) => !currentValue);
    this.requestMapRender(this.selectedBusinessId() !== null);
  }

  scrollFullMapCarousel(direction: 'backward' | 'forward'): void {
    const currentIndex = this.selectedBusinessCarouselStartIndex();
    const nextIndex = direction === 'forward' ? currentIndex + 1 : currentIndex - 1;
    this.carouselStartIndex.set(Math.max(nextIndex, 0));
  }

  previewSelectedBusinessOffer(offer: MarketplaceOfferModel): void {
    this.carouselStartIndex.set(0);
    this.selectedBusinessId.set(offer.business.id);
    this.selectedOfferId.set(offer.id);
  }

  focusOffer(offer: MarketplaceOfferModel): void {
    if (!this.viewerLocation() && !this.selectedCity()) {
      this.selectedCity.set(
        offer.pickupLocation.address.city || offer.business.address.city || null,
      );
    }
    this.carouselStartIndex.set(0);
    this.selectedBusinessId.set(offer.business.id);
    this.selectedOfferId.set(offer.id);
    this.viewMode.set('MAP');
    if (this.sort() !== 'DISTANCE') {
      this.sort.set('DISTANCE');
    }
    this.syncUrlState();
    this.requestMapRender(true);
  }

  openOfferDetails(offer: MarketplaceOfferModel): void {
    void this.router.navigate(['/browse-offers', offer.id]);
  }

  toggleOfferInCart(offer: MarketplaceOfferModel): void {
    if (this.isOwnBusinessOffer(offer)) {
      this.notificationService.info(
        'You cannot reserve offers from your own business.',
        'Offer unavailable',
      );
      return;
    }

    const added = this.offerCart.toggleOffer(offer.id);
    if (added) {
      this.notificationService.success(
        `"${offer.title}" was added to your cart.`,
        'Saved for later',
      );
      return;
    }

    this.notificationService.info(`"${offer.title}" was removed from your cart.`, 'Cart updated');
  }

  loginToAccount(): void {
    void this.userService.login('/browse-offers');
  }

  requestViewerLocation(): void {
    if (!this.geolocation.supportsGeolocation()) {
      this.locationError.set(
        'This browser does not support geolocation, so distance sorting is unavailable here.',
      );
      return;
    }

    this.locating.set(true);
    this.locationError.set(null);

    this.geolocation
      .requestViewerLocation()
      .then((nextLocation) => {
        this.ngZone.run(() => {
          this.viewerLocation.set(nextLocation);
          this.selectedCity.set(null);
          this.viewMode.set('MAP');
          this.locating.set(false);
          storeViewerLocation(nextLocation);
          this.syncLocationSearchFromState();
          this.syncUrlState();
          this.loadOffers();
        });
      })
      .catch(() => {
        this.ngZone.run(() => {
          this.locating.set(false);
          this.syncLocationSearchFromState();
          this.locationError.set(
            'Location access was denied or unavailable. You can still browse manually without distance data.',
          );
        });
      });
  }

  setNativeMapFullscreen(isFullscreen: boolean): void {
    this.isNativeMapFullscreen.set(isFullscreen);
    this.requestMapRender(this.selectedBusinessId() !== null);
  }

  selectBusinessFromMap(cluster: MarketplaceBusinessCluster): void {
    this.carouselStartIndex.set(0);
    this.selectedBusinessId.set(cluster.business.id);
    this.selectedOfferId.set(resolveClusterPreviewOffer(cluster, this.selectedOffer())?.id ?? null);
    this.requestMapRender(true);
  }

  isSelectedBusiness(businessId: number): boolean {
    return this.selectedBusinessId() === businessId;
  }

  isOwnBusinessOffer(offer: MarketplaceOfferModel | null): boolean {
    return !!offer && this.ownedBusinessIds().has(offer.business.id);
  }

  formatDistance(distanceMeters: number | null): string {
    return formatOfferDistance(distanceMeters);
  }

  formatRating(ratingAverage: number | null, ratingCount: number): string | null {
    return formatRating(ratingAverage, ratingCount);
  }

  formatBusinessAvailability(cluster: MarketplaceBusinessCluster): string {
    return formatBusinessAvailability(cluster);
  }

  formatAddress(clusterOrAddress: MarketplaceBusinessCluster['business']['address']): string {
    return formatAddress(clusterOrAddress);
  }

  shouldShowViewerDistance(): boolean {
    return this.viewerLocation() !== null;
  }

  resolveClusterDistanceMeters(cluster: MarketplaceBusinessCluster): number | null {
    return resolveClusterDistanceMeters(cluster, this.mapReferencePoint());
  }

  private toOfferCard(offer: MarketplaceOfferModel) {
    return buildBrowseOfferCard(offer, {
      selectedCity: this.selectedCity(),
      selectedOfferId: this.selectedOfferId(),
      ownBusinessOffer: this.isOwnBusinessOffer(offer),
      inCart: this.offerCart.hasOffer(offer.id),
      distanceMeters: this.viewerLocation() ? this.resolveOfferDistanceMeters(offer) : null,
    });
  }

  private resolveOfferDistanceMeters(offer: MarketplaceOfferModel): number | null {
    return resolveOfferDistanceMeters(offer, this.mapReferencePoint());
  }

  private applyFilterLocation(location: string): boolean {
    const action = resolveFilterLocationAction(
      location,
      this.currentLocationOptionLabel,
      this.viewerLocation(),
      this.cityOptions(),
    );

    if (action.kind === 'request-current-location') {
      this.requestViewerLocation();
      return true;
    }

    if (action.shouldClearViewerLocation) {
      this.viewerLocation.set(null);
    }

    if (action.shouldClearLocationError) {
      this.locationError.set(null);
    }

    if (action.shouldRemoveStoredViewerLocation) {
      removeStoredViewerLocation();
    }

    if (action.shouldUpdateSelectedCity) {
      this.selectedCity.set(action.nextSelectedCity);
      this.rememberSelectedCityScope(action.nextSelectedCity);
    }

    if (action.shouldSyncLocationSearch) {
      this.syncLocationSearchFromState();
    }

    if (action.shouldEnforceMapScopeSelectionUi) {
      this.enforceMapScopeSelectionUi();
    }

    return false;
  }

  private updateSelectedCity(value: string): void {
    const plan = resolveSelectedCityUpdate(value, this.viewerLocation());
    this.selectedCity.set(plan.nextSelectedCity);
    this.rememberSelectedCityScope(plan.nextSelectedCity);
    if (plan.hadViewerLocation) {
      this.viewerLocation.set(null);
    }
    if (plan.shouldClearLocationError) {
      this.locationError.set(null);
    }
    if (plan.shouldRemoveStoredViewerLocation) {
      removeStoredViewerLocation();
    }
    this.syncLocationSearchFromState();
    this.reconcileMapSelection();
    this.syncUrlState();
    this.loadOffers();
    this.requestMapRender(true);
  }

  private loadOffers(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    const referencePoint = this.mapReferencePoint();

    this.marketplaceOfferApi
      .getMarketplaceOffers({
        q: this.searchText().trim() || undefined,
        viewerLat: referencePoint?.latitude ?? null,
        viewerLng: referencePoint?.longitude ?? null,
        radiusKm: referencePoint ? this.radiusKm() : null,
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
          this.requestMapRender(false);
        },
        error: () => {
          this.offers.set([]);
          this.loading.set(false);
          this.errorMessage.set(
            'We could not load rescue offers right now. Please try again soon.',
          );
          this.requestMapRender(false);
        },
      });
  }

  private reconcileSelection(offers: MarketplaceOfferModel[]): void {
    const selectedBusinessId = this.selectedBusinessId();
    if (
      selectedBusinessId !== null &&
      !offers.some((offer) => offer.business.id === selectedBusinessId)
    ) {
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
      this.selectedCityScope.set(null);
      return;
    }

    const matchingCityOption =
      this.cityOptions().find((option) => option.city === selectedCity) ?? null;
    if (matchingCityOption !== null) {
      this.selectedCityScope.set(matchingCityOption);
      return;
    }

    if (this.selectedCityScope()?.city === selectedCity) {
      return;
    }

    this.selectedCity.set(null);
    this.syncLocationSearchFromState();
  }

  private reconcileMapSelection(): void {
    const nextSelection = resolveReconciledMapSelection(
      this.selectedBusinessId(),
      this.selectedOfferId(),
      this.mapScopedBusinesses(),
    );

    if (this.selectedBusinessId() !== nextSelection.selectedBusinessId) {
      this.selectedBusinessId.set(nextSelection.selectedBusinessId);
    }

    if (this.selectedOfferId() !== nextSelection.selectedOfferId) {
      this.selectedOfferId.set(nextSelection.selectedOfferId);
    }
  }

  private applyUrlState(nextState: ReturnType<typeof readUrlState>): {
    changed: boolean;
    requiresReload: boolean;
  } {
    const currentState: BrowseOffersUrlSnapshot = {
      query: this.searchText(),
      sort: this.sort(),
      includeUnavailable: this.includeUnavailable(),
      view: this.viewMode(),
      city: this.selectedCity(),
      radiusKm: this.radiusKm(),
      filters: this.filterModalState(),
    };
    const transition = resolveBrowseOffersUrlStateTransition(
      currentState,
      nextState,
      this.searchDebounceId !== null,
    );

    if (transition.shouldClearSearchDebounce) {
      this.clearSearchDebounce();
    }

    if (this.searchText() !== transition.nextState.query) {
      this.searchText.set(transition.nextState.query);
    }

    if (this.sort() !== transition.nextState.sort) {
      this.sort.set(transition.nextState.sort);
    }

    if (this.includeUnavailable() !== transition.nextState.includeUnavailable) {
      this.includeUnavailable.set(transition.nextState.includeUnavailable);
    }

    if (this.viewMode() !== transition.nextState.view) {
      this.viewMode.set(transition.nextState.view);
      if (transition.shouldExitFullMap) {
        this.isFullMapMode.set(false);
      }
    }

    if (this.selectedCity() !== transition.nextState.city) {
      this.selectedCity.set(transition.nextState.city);
    }
    this.rememberSelectedCityScope(transition.nextState.city);

    if (this.radiusKm() !== transition.nextState.radiusKm) {
      this.radiusKm.set(transition.nextState.radiusKm);
    }

    const nextPickupTodayOnly = transition.nextState.filters.pickupDay === 'today';
    if (this.pickupTodayOnly() !== nextPickupTodayOnly) {
      this.pickupTodayOnly.set(nextPickupTodayOnly);
    }

    this.appliedOfferFilters.set(cloneOfferFilters(transition.nextState.filters));

    return transition.outcome;
  }

  private syncLocationSearchFromState(): void {
    this.locationSearch.set(
      resolveLocationSearchValue(
        this.locating(),
        this.viewerLocation(),
        this.currentLocationOptionLabel,
        this.selectedCity(),
      ),
    );
  }

  private clearCurrentLocationSelectionForEditing(): void {
    this.viewerLocation.set(null);
    this.selectedCity.set(null);
    this.selectedCityScope.set(null);
    this.locationError.set(null);
    removeStoredViewerLocation();
    this.syncLocationSearchFromState();
    this.locationPickerOpen.set(true);
    this.enforceMapScopeSelectionUi();
    this.reconcileMapSelection();
    this.syncUrlState();
    this.loadOffers();
    this.requestMapRender(false);
  }

  private enforceMapScopeSelectionUi(): void {
    if (shouldOpenMapScopeSelection(this.viewMode(), this.viewerLocation(), this.selectedCity())) {
      this.locationPickerOpen.set(true);
    }
  }

  private syncUrlState(): void {
    const mergedQueryParams = buildBrowseOffersQueryParams({
      currentQueryParams: this.route.snapshot.queryParams as Record<string, unknown>,
      searchText: this.searchText(),
      sort: this.sort(),
      includeUnavailable: this.includeUnavailable(),
      viewMode: this.viewMode(),
      selectedCity: this.selectedCity(),
      radiusKm: this.radiusKm(),
      filters: this.filterModalState(),
    });

    if (
      haveSameQueryParams(
        this.route.snapshot.queryParams as Record<string, unknown>,
        mergedQueryParams,
      )
    ) {
      return;
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: mergedQueryParams,
      replaceUrl: true,
    });
  }

  private rememberSelectedCityScope(city: string | null): void {
    if (city === null) {
      this.selectedCityScope.set(null);
      return;
    }

    const matchingCityOption =
      this.cityOptions().find((option) => option.city === city) ?? null;
    if (matchingCityOption !== null) {
      this.selectedCityScope.set(matchingCityOption);
    }
  }

  private resolveDerivedQuickFilters(filters: OfferFilters): string[] {
    const nextQuickFilters: string[] = filters.quickFilters.filter(
      (quickFilter) => quickFilter === 'availableNow',
    );

    if (filters.pickupDay === 'today') {
      nextQuickFilters.push('pickupToday');
    }

    if (this.viewerLocation()) {
      nextQuickFilters.push('nearMe');
    }

    if (filters.discountPreset === '50') {
      nextQuickFilters.push('bestDiscount');
    }

    return Array.from(new Set(nextQuickFilters));
  }

  private requestMapRender(focusSelectedBusiness: boolean): void {
    this.nextMapRenderRequestId += 1;
    this.mapRenderRequest.set(
      createBrowseOffersMapRenderRequest(this.nextMapRenderRequestId, focusSelectedBusiness),
    );
  }

  private clearSearchDebounce(): void {
    if (this.searchDebounceId !== null) {
      window.clearTimeout(this.searchDebounceId);
      this.searchDebounceId = null;
    }
  }
}
