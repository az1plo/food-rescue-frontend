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
import { OfferCheckoutService } from '../../services/offer-checkout.service';
import { MarketplaceOfferApiService } from '../../services/marketplace-offer-api.service';
import { OfferCartItem, OfferCartService } from '../../services/offer-cart.service';

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
  private readonly offerCheckout = inject(OfferCheckoutService);
  private readonly marketplaceOfferApi = inject(MarketplaceOfferApiService);
  private readonly notificationInbox = inject(NotificationInboxService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);

  private loadSequence = 0;

  protected readonly icons = appIcons;
  protected readonly user = this.userService.getUser();
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly cartItems = this.offerCart.items;
  protected readonly offers = signal<MarketplaceOfferModel[]>([]);
  protected readonly cardHolderName = signal('');
  protected readonly cardNumberDigits = signal('');
  protected readonly processingCheckout = signal(false);

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
  protected readonly checkoutReadyEntries = computed(
    () => this.cartEntries().filter((entry) => entry.offer?.canReserve),
  );
  protected readonly checkoutTotal = computed(
    () => this.checkoutReadyEntries().reduce((sum, entry) => sum + (entry.offer?.price ?? 0), 0),
  );
  protected readonly formattedCardNumber = computed(() => this.formatCardNumber(this.cardNumberDigits()));

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

  protected updateCardHolderName(value: string): void {
    this.cardHolderName.set(value);
  }

  protected updateCardNumber(value: string): void {
    this.cardNumberDigits.set(value.replace(/\D/g, '').slice(0, 16));
  }

  protected checkoutFieldsDisabled(): boolean {
    return this.processingCheckout() || !this.user();
  }

  protected canStartCheckout(): boolean {
    if (this.processingCheckout() || !this.checkoutReadyEntries().length) {
      return false;
    }

    if (!this.user()) {
      return true;
    }

    return this.hasPaymentDetails();
  }

  protected checkoutButtonLabel(): string {
    if (this.processingCheckout()) {
      return 'Processing payment...';
    }

    if (!this.user()) {
      return 'Sign in to pay';
    }

    const readyCount = this.checkoutReadyEntries().length;
    if (!readyCount) {
      return 'No offers ready';
    }

    return `Pay for ${readyCount} ${readyCount === 1 ? 'order' : 'orders'}`;
  }

  protected async simulateCheckout(): Promise<void> {
    if (this.processingCheckout()) {
      return;
    }

    if (!this.user()) {
      await this.userService.login('/cart');
      return;
    }

    if (!this.hasPaymentDetails()) {
      this.notificationService.info('Add a cardholder name and at least the last four card digits to continue to payment.');
      return;
    }

    this.processingCheckout.set(true);
    this.errorMessage.set(null);
    const readyEntries = this.checkoutReadyEntries();
    const checkoutResult = await this.offerCheckout.checkoutOffers(
      readyEntries
        .map((entry) => entry.offer)
        .filter((offer): offer is MarketplaceOfferModel => offer !== null)
        .map((offer) => ({
          offerId: offer.id,
          quantity: 1,
        })),
      {
        cardHolderName: this.cardHolderName().trim(),
        cardLast4: this.cardNumberDigits().slice(-4),
      },
    );

    this.processingCheckout.set(false);
    this.notificationInbox.refresh();

    if (checkoutResult.completedOfferIds.length) {
      for (const offerId of checkoutResult.completedOfferIds) {
        this.offerCart.removeOffer(offerId);
      }

      this.notificationService.success(
        `${checkoutResult.completedOfferIds.length} ${checkoutResult.completedOfferIds.length === 1 ? 'order is' : 'orders are'} paid successfully. Pickup passes are now ready in My pickups.`,
        'Payment accepted',
      );
      void this.router.navigateByUrl('/my-pickups');
    }

    if (checkoutResult.failedOfferIds.length) {
      this.notificationService.error(
        `${checkoutResult.failedOfferIds.length} ${checkoutResult.failedOfferIds.length === 1 ? 'offer could not' : 'offers could not'} be paid. No pickup order was created for those items.`,
        'Checkout incomplete',
      );
    }

    if (checkoutResult.unauthorized) {
      await this.userService.login('/cart');
    }
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

  private hasPaymentDetails(): boolean {
    return this.cardHolderName().trim().length >= 2 && this.cardNumberDigits().length >= 4;
  }

  private formatCardNumber(value: string): string {
    return value.replace(/(.{4})/g, '$1 ').trim();
  }

  private isSameCalendarDay(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }
}
