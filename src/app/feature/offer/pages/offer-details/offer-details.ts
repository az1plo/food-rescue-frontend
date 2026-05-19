import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { BusinessWorkspaceStateService } from '../../../../core/services/business-workspace-state.service';
import { MarketplaceOfferApiService } from '../../../../core/services/marketplace-offer-api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { OfferCartService } from '../../../../core/services/offer-cart.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { resolveBusinessIconUrl } from '../../../../shared/models/business.model';
import { OfferCardComponent } from '../../../../shared/ui/offer-card/offer-card';
import { OfferCardModel } from '../../../../shared/ui/offer-card/offer-card.models';
import {
  buildOfferBusinessMark,
  createMarketplaceOfferCardModel,
  formatOfferAvailabilityLabel,
  formatOfferDistance,
  formatOfferPickupWindow,
  formatOfferRatingValue,
  marketplaceOfferLocationLabel,
} from '../../../../shared/ui/offer-card/offer-card.utils';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { MarketplaceOfferModel } from '../../models/marketplace-offer.model';
import { OfferCategory, OfferItemModel, OfferModel, resolveOfferImage } from '../../models/offer.model';
import { OfferApiService } from '../../services/offer-api.service';

interface ViewerLocation {
  latitude: number;
  longitude: number;
}

interface RelatedOfferCardItem {
  offer: MarketplaceOfferModel;
  card: OfferCardModel;
  showRatingIcon: boolean;
}

const LOCATION_STORAGE_KEY = 'savr:browse-viewer-location';
const LEGACY_LOCATION_STORAGE_KEY = 'food-rescue:browse-viewer-location';

@Component({
  selector: 'app-offer-details-page',
  imports: [FontAwesomeModule, ActionButtonComponent, OfferCardComponent],
  templateUrl: './offer-details.html',
  styleUrl: './offer-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferDetailsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly marketplaceOfferApi = inject(MarketplaceOfferApiService);
  private readonly offerApi = inject(OfferApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly offerCart = inject(OfferCartService);

  protected readonly icons = appIcons;
  protected readonly ownedBusinessIds = computed(() => new Set(this.businessWorkspaceState.knownBusinesses().map((business) => business.id)));
  protected readonly loadingSkeletonIds = [1, 2, 3] as const;
  protected readonly relatedLoadingSkeletonIds = [1, 2, 3, 4] as const;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly marketplaceOffer = signal<MarketplaceOfferModel | null>(null);
  protected readonly detailedOffer = signal<OfferModel | null>(null);
  protected readonly relatedOffers = signal<MarketplaceOfferModel[]>([]);
  protected readonly viewerLocation = signal<ViewerLocation | null>(this.readStoredViewerLocation());
  protected readonly hasViewerLocation = computed(() => this.viewerLocation() !== null);

  protected readonly currentOffer = computed(() => this.marketplaceOffer());
  protected readonly currentItems = computed<OfferItemModel[]>(() => this.detailedOffer()?.items ?? []);
  protected readonly currentDescription = computed(
    () =>
      this.currentOffer()?.description?.trim()
      || this.detailedOffer()?.description?.trim()
      || 'This rescue offer is ready for pickup and helps keep good food in circulation.',
  );
  protected readonly currentImage = computed(() => {
    const marketplaceOffer = this.currentOffer();
    if (marketplaceOffer) {
      return resolveOfferImage(marketplaceOffer.imageUrl, marketplaceOffer.id);
    }

    const detailedOffer = this.detailedOffer();
    return resolveOfferImage(detailedOffer?.imageUrl, detailedOffer?.id ?? 0);
  });
  protected readonly isCurrentOfferInCart = computed(() => {
    const offer = this.currentOffer();
    return offer ? this.offerCart.hasOffer(offer.id) : false;
  });
  protected readonly currentBusinessMark = computed(() => {
    const offer = this.currentOffer();
    return offer ? buildOfferBusinessMark(offer.business.name) : '?';
  });
  protected readonly currentBusinessIconUrl = computed(() => {
    const offer = this.currentOffer();
    return offer ? resolveBusinessIconUrl(offer.business.iconUrl) : null;
  });
  protected readonly currentBusinessLocation = computed(() => {
    const offer = this.currentOffer();
    return offer ? this.resolveOfferLocationLabel(offer) : 'Location unavailable';
  });
  protected readonly currentRatingValue = computed(() => {
    const offer = this.currentOffer();
    return offer ? this.ratingAverageLabel(offer.business.ratingAverage, offer.business.ratingCount) : 'New';
  });
  protected readonly currentRatingCount = computed(() => {
    const offer = this.currentOffer();
    return offer ? this.ratingCountLabel(offer.business.ratingCount) : null;
  });
  protected readonly currentQuantityLabel = computed(() => {
    const offer = this.currentOffer();
    return offer ? formatOfferAvailabilityLabel(offer.quantityAvailable, offer.status) : 'Unavailable';
  });
  protected readonly currentCategoryLabel = computed(() => {
    const offer = this.currentOffer();
    return offer ? this.formatCategoryLabel(offer.category) : null;
  });
  protected readonly currentPickupInstructions = computed(() => {
    const offer = this.currentOffer();
    const pickupNote = offer?.pickupLocation.note?.trim();
    return pickupNote || 'Please follow the business pickup instructions and arrive during the selected pickup window.';
  });
  protected readonly currentBusinessDescription = computed(() => {
    const offer = this.currentOffer();
    return offer?.business.description?.trim()
      || 'This local business regularly shares rescue offers to keep good food moving instead of going to waste.';
  });
  protected readonly currentLocationFactLabel = computed(() => {
    const offer = this.currentOffer();
    if (!offer) {
      return 'Pickup point';
    }

    return this.hasViewerLocation() && offer.distanceMeters !== null
      ? formatOfferDistance(offer.distanceMeters)
      : 'Pickup point';
  });
  protected readonly relatedOfferCards = computed<RelatedOfferCardItem[]>(() =>
    this.relatedOffers().map((offer) => ({
      offer,
      showRatingIcon: offer.business.ratingAverage !== null && offer.business.ratingCount > 0,
      card: createMarketplaceOfferCardModel(offer, {
        price: this.formatPrice(offer.price),
        originalPrice: this.hasDiscount(offer.price, offer.originalPrice)
          ? this.formatPrice(offer.originalPrice ?? offer.price)
          : null,
        rating: formatOfferRatingValue(offer.business.ratingAverage, offer.business.ratingCount, 'New'),
        pickup: formatOfferPickupWindow(offer.pickupTimeWindow),
        distance: this.hasViewerLocation() && offer.distanceMeters !== null
          ? formatOfferDistance(offer.distanceMeters)
          : null,
        availabilityLabel: formatOfferAvailabilityLabel(offer.quantityAvailable, offer.status),
        businessArea: this.resolveOfferLocationLabel(offer),
      }),
    })),
  );

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      const rawOfferId = paramMap.get('id');
      const offerId = rawOfferId ? Number(rawOfferId) : Number.NaN;

      if (!Number.isInteger(offerId) || offerId <= 0) {
        this.loading.set(false);
        this.errorMessage.set('This offer could not be found.');
        this.marketplaceOffer.set(null);
        this.detailedOffer.set(null);
        this.relatedOffers.set([]);
        return;
      }

      if (Object.keys(this.route.snapshot.queryParams).length > 0) {
        void this.router.navigate(['/browse-offers', offerId], {
          replaceUrl: true,
        });
      }

      this.loadOffer(offerId);
    });
  }

  protected goBackToBrowse(): void {
    void this.router.navigate(['/browse-offers']);
  }

  protected openRelatedOffer(offer: MarketplaceOfferModel): void {
    void this.router.navigate(['/browse-offers', offer.id]);
  }

  protected toggleCurrentOfferInCart(): void {
    const offer = this.currentOffer();
    if (!offer) {
      return;
    }

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

  protected startCheckoutForCurrentOffer(): void {
    const offer = this.currentOffer();
    if (!offer) {
      return;
    }

    if (this.isOwnBusinessOffer(offer)) {
      void this.router.navigate(['/workspace', 'my-businesses', offer.business.id, 'offers']);
      return;
    }

    if (!offer.canReserve) {
      return;
    }

    if (!this.isCurrentOfferInCart()) {
      this.offerCart.addOffer(offer.id);
    }

    void this.router.navigateByUrl('/cart');
  }

  protected formatPrice(price: number): string {
    return `€${price.toFixed(2)}`;
  }

  protected hasDiscount(price: number, originalPrice: number | null): boolean {
    return typeof originalPrice === 'number' && originalPrice > price;
  }

  protected discountPercent(price: number, originalPrice: number | null): number | null {
    if (!this.hasDiscount(price, originalPrice) || originalPrice === null) {
      return null;
    }

    return Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  protected detailPrimaryActionLabel(): string {
    const offer = this.currentOffer();
    if (!offer) {
      return 'View details';
    }

    if (this.isOwnBusinessOffer(offer)) {
      return 'Manage this offer';
    }

    if (!offer.canReserve) {
      return offer.status === 'EXPIRED' ? 'Expired' : 'Unavailable';
    }

    return this.isCurrentOfferInCart() ? 'Go to checkout' : 'Reserve now';
  }

  protected detailCartActionLabel(): string {
    return this.isCurrentOfferInCart() ? 'Remove saved' : 'Save';
  }

  protected detailCartActionIcon() {
    return this.isCurrentOfferInCart() ? this.icons.xmark : this.icons.bagShopping;
  }

  protected detailPrimaryActionIcon() {
    const offer = this.currentOffer();
    if (this.isOwnBusinessOffer(offer)) {
      return this.icons.store;
    }

    return offer?.canReserve ? this.icons.creditCard : this.icons.eye;
  }

  protected detailPrimaryActionDisabled(): boolean {
    const offer = this.currentOffer();
    if (!offer) {
      return true;
    }

    if (this.isOwnBusinessOffer(offer)) {
      return false;
    }

    return !offer.canReserve;
  }

  protected formatDistance(distanceMeters: number | null): string {
    return formatOfferDistance(distanceMeters);
  }

  protected formatAddress(offer: MarketplaceOfferModel): string {
    return [
      offer.pickupLocation.address.street,
      offer.pickupLocation.address.city,
      offer.pickupLocation.address.country,
    ]
      .filter(Boolean)
      .join(', ');
  }

  protected formatOfferPickupWindow(offer: MarketplaceOfferModel): string {
    return formatOfferPickupWindow(offer.pickupTimeWindow);
  }

  protected itemSummary(item: OfferItemModel): string {
    return `${item.quantity}x ${item.name}`;
  }

  protected ratingAverageLabel(ratingAverage: number | null, ratingCount: number): string {
    if (ratingAverage === null || ratingCount <= 0) {
      return 'New';
    }

    return ratingAverage.toFixed(1);
  }

  protected ratingCountLabel(ratingCount: number): string | null {
    return ratingCount > 0 ? `(${ratingCount})` : null;
  }

  protected formatCategoryLabel(category: OfferCategory): string {
    return category
      .toLowerCase()
      .split('_')
      .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  protected isOwnBusinessOffer(offer: MarketplaceOfferModel | null): boolean {
    return !!offer && this.ownedBusinessIds().has(offer.business.id);
  }

  private resolveOfferLocationLabel(offer: MarketplaceOfferModel): string {
    const pickupStreet = offer.pickupLocation.address.street?.trim() || null;
    const businessStreet = offer.business.address.street?.trim() || null;

    if (this.viewerLocation()) {
      return pickupStreet || businessStreet || marketplaceOfferLocationLabel(offer);
    }

    return marketplaceOfferLocationLabel(offer);
  }

  private loadOffer(offerId: number): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    const viewerLocation = this.viewerLocation();

    this.marketplaceOfferApi
      .getMarketplaceOffers({
        viewerLat: viewerLocation?.latitude ?? null,
        viewerLng: viewerLocation?.longitude ?? null,
        sort: 'DISTANCE',
        includeUnavailable: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (offers) => {
          const targetOffer = offers.find((offer) => offer.id === offerId);
          if (!targetOffer) {
            this.marketplaceOffer.set(null);
            this.detailedOffer.set(null);
            this.relatedOffers.set([]);
            this.loading.set(false);
            this.errorMessage.set('This offer is no longer available in the marketplace.');
            return;
          }

          const relatedOffers = offers
            .filter((offer) => offer.business.id === targetOffer.business.id && offer.id !== targetOffer.id)
            .sort((first, second) => {
              if (first.canReserve !== second.canReserve) {
                return first.canReserve ? -1 : 1;
              }

              const firstDistance = first.distanceMeters ?? Number.POSITIVE_INFINITY;
              const secondDistance = second.distanceMeters ?? Number.POSITIVE_INFINITY;
              if (firstDistance !== secondDistance) {
                return firstDistance - secondDistance;
              }

              return first.title.localeCompare(second.title);
            })
            .slice(0, 4);

          this.marketplaceOffer.set(targetOffer);
          this.relatedOffers.set(relatedOffers);

          this.offerApi
            .getOffers(targetOffer.business.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (businessOffers) => {
                this.detailedOffer.set(businessOffers.find((offer) => offer.id === offerId) ?? null);
                this.loading.set(false);
              },
              error: () => {
                this.detailedOffer.set(null);
                this.loading.set(false);
              },
            });
        },
        error: () => {
          this.marketplaceOffer.set(null);
          this.detailedOffer.set(null);
          this.relatedOffers.set([]);
          this.loading.set(false);
          this.errorMessage.set('We could not load this offer right now. Please try again soon.');
        },
      });
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

}
