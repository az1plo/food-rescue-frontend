import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { MarketplaceOfferModel } from '../../models/marketplace-offer.model';
import { OfferItemModel, OfferModel, OfferStatus, resolveOfferImage } from '../../models/offer.model';
import { MarketplaceOfferApiService } from '../../services/marketplace-offer-api.service';
import { OfferApiService } from '../../services/offer-api.service';
import { OfferCartService } from '../../services/offer-cart.service';
import { ReservationApiService } from '../../services/reservation-api.service';

interface ViewerLocation {
  latitude: number;
  longitude: number;
}

const LOCATION_STORAGE_KEY = 'savr:browse-viewer-location';
const LEGACY_LOCATION_STORAGE_KEY = 'food-rescue:browse-viewer-location';

@Component({
  selector: 'app-offer-details-page',
  imports: [FontAwesomeModule, ActionButtonComponent],
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
  private readonly reservationApi = inject(ReservationApiService);
  private readonly notificationInbox = inject(NotificationInboxService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);
  private readonly offerCart = inject(OfferCartService);

  protected readonly user = this.userService.getUser();
  protected readonly icons = appIcons;
  protected readonly loading = signal(true);
  protected readonly reserving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly marketplaceOffer = signal<MarketplaceOfferModel | null>(null);
  protected readonly detailedOffer = signal<OfferModel | null>(null);
  protected readonly relatedOffers = signal<MarketplaceOfferModel[]>([]);

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

      this.loadOffer(offerId);
    });
  }

  protected goBackToBrowse(): void {
    void this.router.navigate(['/browse-offers'], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  protected openRelatedOffer(offer: MarketplaceOfferModel): void {
    void this.router.navigate(['/browse-offers', offer.id], {
      queryParams: this.route.snapshot.queryParams,
    });
  }

  protected toggleCurrentOfferInCart(): void {
    const offer = this.currentOffer();
    if (!offer) {
      return;
    }

    const added = this.offerCart.toggleOffer(offer.id);
    if (added) {
      this.notificationService.success(`"${offer.title}" was added to your cart.`, 'Saved for later');
      return;
    }

    this.notificationService.info(`"${offer.title}" was removed from your cart.`, 'Cart updated');
  }

  protected reserveCurrentOffer(): void {
    const offer = this.currentOffer();
    if (!offer || !offer.canReserve || this.reserving()) {
      return;
    }

    if (!this.user()) {
      void this.userService.login(this.router.url);
      return;
    }

    this.reserving.set(true);
    this.reservationApi
      .createReservation({ offerId: offer.id, quantity: 1 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notificationService.success(`"${offer.title}" was reserved successfully.`, 'Reservation confirmed');
          this.notificationInbox.refresh();
          this.reserving.set(false);
          this.loadOffer(offer.id);
        },
        error: (error: { status?: number } | undefined) => {
          this.reserving.set(false);

          if (error?.status === 401) {
            void this.userService.login(this.router.url);
            return;
          }

          this.notificationService.error('This offer could not be reserved right now. Please refresh and try again.');
        },
      });
  }

  protected resolveRelatedOfferImage(offer: MarketplaceOfferModel): string {
    return resolveOfferImage(offer.imageUrl, offer.id);
  }

  protected formatPrice(price: number): string {
    return `${price.toFixed(2)} EUR`;
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

  protected offerStatusLabel(status: OfferStatus): string {
    return status
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  protected detailPrimaryActionLabel(): string {
    const offer = this.currentOffer();
    if (!offer) {
      return 'View details';
    }

    if (this.reserving()) {
      return 'Reserving...';
    }

    if (!offer.canReserve) {
      return offer.status === 'EXPIRED' ? 'Expired' : 'Unavailable';
    }

    return this.user() ? 'Reserve now' : 'Sign in to reserve';
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

  protected formatRating(ratingAverage: number | null, ratingCount: number): string {
    if (ratingAverage === null || ratingCount <= 0) {
      return 'New business';
    }

    return `${ratingAverage.toFixed(1)} (${ratingCount})`;
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

  protected itemSummary(item: OfferItemModel): string {
    return `${item.quantity}x ${item.name}`;
  }

  private loadOffer(offerId: number): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    const viewerLocation = this.readStoredViewerLocation();

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

  private isSameCalendarDay(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }
}
