import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { MarketplaceOfferModel } from '../../models/marketplace-offer.model';
import { OfferStatus, resolveOfferImage } from '../../models/offer.model';
import { MarketplaceOfferApiService } from '../../services/marketplace-offer-api.service';
import { OfferCartItem, OfferCartService } from '../../services/offer-cart.service';
import { ReservationApiService } from '../../services/reservation-api.service';

interface CartEntryViewModel {
  offerId: number;
  addedAt: string;
  offer: MarketplaceOfferModel | null;
}

@Component({
  selector: 'app-cart-page',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './cart.html',
  styleUrl: './cart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly offerCart = inject(OfferCartService);
  private readonly marketplaceOfferApi = inject(MarketplaceOfferApiService);
  private readonly reservationApi = inject(ReservationApiService);
  private readonly notificationInbox = inject(NotificationInboxService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);

  private loadSequence = 0;

  protected readonly icons = appIcons;
  protected readonly user = this.userService.getUser();
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly reservingIds = signal<number[]>([]);
  protected readonly cartItems = this.offerCart.items;
  protected readonly offers = signal<MarketplaceOfferModel[]>([]);

  protected readonly cartEntries = computed<CartEntryViewModel[]>(() => {
    const offersById = new Map(this.offers().map((offer) => [offer.id, offer]));
    return this.cartItems().map((item) => ({
      offerId: item.offerId,
      addedAt: item.addedAt,
      offer: offersById.get(item.offerId) ?? null,
    }));
  });

  protected readonly availableEntryCount = computed(
    () => this.cartEntries().filter((entry) => entry.offer?.canReserve).length,
  );
  protected readonly unavailableEntryCount = computed(
    () => this.cartEntries().filter((entry) => entry.offer !== null && !entry.offer.canReserve).length,
  );
  protected readonly missingEntryCount = computed(
    () => this.cartEntries().filter((entry) => entry.offer === null).length,
  );

  constructor() {
    effect(() => {
      this.loadCartOffers(this.cartItems());
    });
  }

  protected continueBrowsing(): void {
    void this.router.navigateByUrl('/browse-offers');
  }

  protected openOfferDetails(offer: MarketplaceOfferModel): void {
    void this.router.navigate(['/browse-offers', offer.id]);
  }

  protected removeOffer(offerId: number): void {
    this.offerCart.removeOffer(offerId);
    this.notificationService.info('Offer removed from your cart.', 'Cart updated');
  }

  protected clearCart(): void {
    this.offerCart.clear();
    this.notificationService.info('Your cart is now empty.', 'Cart cleared');
  }

  protected reserveOffer(entry: CartEntryViewModel): void {
    const offer = entry.offer;
    if (!offer || !offer.canReserve || this.isReserving(offer.id)) {
      return;
    }

    if (!this.user()) {
      void this.userService.login('/cart');
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
          this.offerCart.removeOffer(offer.id);
          this.removeReservingId(offer.id);
        },
        error: (error: { status?: number } | undefined) => {
          this.removeReservingId(offer.id);

          if (error?.status === 401) {
            void this.userService.login('/cart');
            return;
          }

          this.notificationService.error('This offer could not be reserved right now. Please refresh and try again.');
        },
      });
  }

  protected isReserving(offerId: number): boolean {
    return this.reservingIds().includes(offerId);
  }

  protected reserveButtonLabel(entry: CartEntryViewModel): string {
    const offer = entry.offer;
    if (!offer) {
      return 'No longer listed';
    }

    if (this.isReserving(offer.id)) {
      return 'Reserving...';
    }

    if (!offer.canReserve) {
      return offer.status === 'EXPIRED' ? 'Expired' : 'Unavailable';
    }

    return this.user() ? 'Reserve now' : 'Sign in to reserve';
  }

  protected formatPrice(price: number): string {
    return `${price.toFixed(2)} EUR`;
  }

  protected hasDiscount(price: number, originalPrice: number | null): boolean {
    return typeof originalPrice === 'number' && originalPrice > price;
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

  protected offerStatusLabel(status: OfferStatus): string {
    return status
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  protected resolveOfferImage(offer: MarketplaceOfferModel): string {
    return resolveOfferImage(offer.imageUrl, offer.id);
  }

  private loadCartOffers(cartItems: readonly OfferCartItem[]): void {
    const offerIds = cartItems.map((item) => item.offerId);
    const requestedOfferIds = new Set(offerIds);
    const currentLoadSequence = ++this.loadSequence;

    if (!offerIds.length) {
      this.offers.set([]);
      this.loading.set(false);
      this.errorMessage.set(null);
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.marketplaceOfferApi
      .getMarketplaceOffers({
        includeUnavailable: true,
        sort: 'NEWEST',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (offers) => {
          if (currentLoadSequence !== this.loadSequence) {
            return;
          }

          this.offers.set(offers.filter((offer) => requestedOfferIds.has(offer.id)));
          this.loading.set(false);
        },
        error: () => {
          if (currentLoadSequence !== this.loadSequence) {
            return;
          }

          this.offers.set([]);
          this.loading.set(false);
          this.errorMessage.set('We could not refresh your cart right now. Please try again soon.');
        },
      });
  }

  private removeReservingId(offerId: number): void {
    this.reservingIds.update((ids) => ids.filter((currentId) => currentId !== offerId));
  }

  private isSameCalendarDay(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }
}
