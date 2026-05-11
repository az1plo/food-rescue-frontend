import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { buildBusinessMark, resolveBusinessIconUrl } from '../../../business/models/business.model';
import { BusinessWorkspaceStateService } from '../../../business/services/business-workspace-state.service';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
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

interface PickupScheduleEntryViewModel {
  offerId: number;
  offer: MarketplaceOfferModel;
}

@Component({
  selector: 'app-cart-page',
  imports: [FontAwesomeModule],
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
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly currencyFormatter = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  private loadSequence = 0;

  protected readonly icons = appIcons;
  protected readonly user = this.userService.getUser();
  protected readonly ownedBusinessIds = computed(() => new Set(this.businessWorkspaceState.knownBusinesses().map((business) => business.id)));
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly cartItems = this.offerCart.items;
  protected readonly offers = signal<MarketplaceOfferModel[]>([]);
  protected readonly marketplaceOffers = signal<MarketplaceOfferModel[]>([]);
  protected readonly checkoutModalOpen = signal(false);
  protected readonly selectedQuantities = signal<Record<number, number>>({});
  protected readonly cardHolderName = signal('');
  protected readonly cardLast4 = signal('');
  protected readonly cardDigitsCount = signal(0);
  protected readonly cardExpiry = signal('');
  protected readonly processingCheckout = signal(false);
  protected readonly loadingSkeletonIds = [1, 2, 3];

  protected readonly cartEntries = computed<CartEntryViewModel[]>(() => {
    const offersById = new Map(this.offers().map((offer) => [offer.id, offer]));
    return this.cartItems().map((item) => ({
      offerId: item.offerId,
      addedAt: item.addedAt,
      offer: offersById.get(item.offerId) ?? null,
    }));
  });

  protected readonly availableEntryCount = computed(
    () => this.cartEntries().filter((entry) => this.isOfferReadyForCheckout(entry.offer)).length,
  );
  protected readonly unavailableEntryCount = computed(
    () => this.cartEntries().filter((entry) => entry.offer !== null && !this.isOfferReadyForCheckout(entry.offer)).length,
  );
  protected readonly missingEntryCount = computed(
    () => this.cartEntries().filter((entry) => entry.offer === null).length,
  );
  protected readonly checkoutReadyEntries = computed<(CartEntryViewModel & { offer: MarketplaceOfferModel })[]>(() =>
    this.cartEntries().filter((entry): entry is CartEntryViewModel & { offer: MarketplaceOfferModel } => this.isOfferReadyForCheckout(entry.offer)),
  );
  protected readonly checkoutTotal = computed(
    () => this.checkoutReadyEntries().reduce((sum, entry) => sum + this.entryPriceTotal(entry.offer), 0),
  );
  protected readonly subtotal = computed(() => this.checkoutTotal());
  protected readonly serviceFee = computed(() => 0);
  protected readonly estimatedTax = computed(() => 0);
  protected readonly checkoutItemCount = computed(
    () => this.checkoutReadyEntries().reduce((sum, entry) => sum + this.selectedQuantity(entry.offer.id, entry.offer), 0),
  );
  protected readonly totalSavings = computed(() =>
    this.roundCurrency(
      this.checkoutReadyEntries().reduce(
        (sum, entry) => sum + this.entrySavingsTotal(entry.offer),
        0,
      ),
    ),
  );
  protected readonly checkoutGrandTotal = computed(() =>
    this.roundCurrency(this.subtotal() + this.serviceFee() + this.estimatedTax()),
  );
  protected readonly checkoutOriginalTotal = computed(() =>
    this.roundCurrency(this.checkoutGrandTotal() + this.totalSavings()),
  );
  protected readonly hasBlockingLoadError = computed(
    () => Boolean(this.errorMessage()) && !this.loading() && !this.offers().length && this.cartItems().length > 0,
  );
  protected readonly pickupScheduleEntries = computed<PickupScheduleEntryViewModel[]>(() => {
    const source = this.checkoutReadyEntries().length
      ? this.checkoutReadyEntries()
      : this.cartEntries().filter((entry): entry is CartEntryViewModel & { offer: MarketplaceOfferModel } => entry.offer !== null);

    return source.map((entry) => ({
      offerId: entry.offerId,
      offer: entry.offer,
    }));
  });
  protected readonly suggestedOffers = computed(() => {
    const cartOfferIds = new Set(this.cartItems().map((item) => item.offerId));
    return this.marketplaceOffers()
      .filter((offer) => this.isOfferReadyForCheckout(offer) && !cartOfferIds.has(offer.id))
      .slice(0, 4);
  });

  constructor() {
    effect(() => {
      this.loadCartOffers(this.cartItems());
    });

    effect(() => {
      const entries = this.cartEntries();
      const current = this.selectedQuantities();
      const next: Record<number, number> = {};
      let changed = Object.keys(current).length !== entries.length;

      for (const entry of entries) {
        const normalized = this.clampQuantity(current[entry.offerId] ?? 1, entry.offer);
        next[entry.offerId] = normalized;

        if (current[entry.offerId] !== normalized) {
          changed = true;
        }
      }

      if (changed) {
        this.selectedQuantities.set(next);
      }
    });

    effect(() => {
      if (!this.cartItems().length || !this.checkoutReadyEntries().length || !this.user()) {
        this.closeCheckoutModal();
      }
    });
  }

  @HostListener('document:keydown.escape')
  protected handleEscapeKey(): void {
    if (this.checkoutModalOpen()) {
      this.closeCheckoutModal();
    }
  }

  protected continueBrowsing(): void {
    void this.router.navigateByUrl('/browse-offers');
  }

  protected openOfferDetails(offer: MarketplaceOfferModel): void {
    void this.router.navigate(['/browse-offers', offer.id]);
  }

  protected addSuggestedOffer(offer: MarketplaceOfferModel, event: Event): void {
    event.stopPropagation();

    if (this.isOwnBusinessOffer(offer)) {
      this.notificationService.info('You cannot reserve offers from your own business.', 'Offer unavailable');
      return;
    }

    if (this.offerCart.hasOffer(offer.id)) {
      this.notificationService.info(`"${offer.title}" is already in your cart.`, 'Cart updated');
      return;
    }

    this.offerCart.addOffer(offer.id);
    this.notificationService.success(`"${offer.title}" was added to your cart.`, 'Saved for later');
  }

  protected removeOffer(offerId: number): void {
    this.offerCart.removeOffer(offerId);
    this.notificationService.info('Offer removed from your cart.', 'Cart updated');
  }

  protected clearCart(): void {
    this.closeCheckoutModal();
    this.offerCart.clear();
    this.notificationService.info('Your cart is now empty.', 'Cart cleared');
  }

  protected updateCardHolderName(value: string): void {
    this.cardHolderName.set(value);
  }

  protected updateCardNumber(input: HTMLInputElement): void {
    const digits = input.value.replace(/\D/g, '').slice(0, 16);
    input.value = digits.replace(/(.{4})/g, '$1 ').trim();
    this.cardLast4.set(digits.slice(-4));
    this.cardDigitsCount.set(digits.length);
  }

  protected updateCardExpiry(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    this.cardExpiry.set(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
  }

  protected updateEntryQuantity(offerId: number, offer: MarketplaceOfferModel, value: string): void {
    const parsedValue = Number(value);
    this.selectedQuantities.update((quantities) => ({
      ...quantities,
      [offerId]: this.clampQuantity(parsedValue, offer),
    }));
  }

  protected checkoutFieldsDisabled(): boolean {
    return this.processingCheckout() || !this.user();
  }

  protected canStartCheckout(): boolean {
    return !this.processingCheckout() && !!this.checkoutReadyEntries().length;
  }

  protected canConfirmCheckout(): boolean {
    return this.canStartCheckout() && !!this.user() && this.hasPaymentDetails();
  }

  protected checkoutConfirmLabel(): string {
    return this.processingCheckout() ? 'Processing payment...' : 'Confirm and reserve';
  }

  protected async openCheckoutModal(): Promise<void> {
    if (this.processingCheckout()) {
      return;
    }

    if (!this.checkoutReadyEntries().length) {
      this.notificationService.info('No offers are ready for checkout right now.', 'Cart updated');
      return;
    }

    if (!this.user()) {
      await this.userService.login('/cart');
      return;
    }

    this.checkoutModalOpen.set(true);
  }

  protected closeCheckoutModal(): void {
    if (this.processingCheckout()) {
      return;
    }

    this.checkoutModalOpen.set(false);
    this.resetCheckoutDraft();
  }

  protected async simulateCheckout(): Promise<void> {
    if (this.processingCheckout()) {
      return;
    }

    if (!this.checkoutReadyEntries().length) {
      this.notificationService.info('No offers are ready for checkout right now.', 'Cart updated');
      this.closeCheckoutModal();
      return;
    }

    if (!this.user()) {
      this.closeCheckoutModal();
      await this.userService.login('/cart');
      return;
    }

    if (!this.hasPaymentDetails()) {
      this.notificationService.info(
        'Add a cardholder name and at least the last four card digits to continue to payment.',
        'Payment details needed',
      );
      return;
    }

    this.processingCheckout.set(true);
    this.errorMessage.set(null);
    const readyEntries = this.checkoutReadyEntries();
    const checkoutResult = await this.offerCheckout.checkoutOffers(
      readyEntries.map((entry) => ({
        offerId: entry.offer.id,
        quantity: this.selectedQuantity(entry.offer.id, entry.offer),
      })),
      {
        cardHolderName: this.cardHolderName().trim(),
        cardLast4: this.cardLast4(),
      },
    );

    this.processingCheckout.set(false);
    this.notificationInbox.refresh();

    if (checkoutResult.completedOfferIds.length) {
      this.closeCheckoutModal();

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
      this.closeCheckoutModal();
      await this.userService.login('/cart');
    }
  }

  protected formatPrice(price: number): string {
    return this.currencyFormatter.format(price);
  }

  protected hasDiscount(price: number, originalPrice: number | null): boolean {
    return typeof originalPrice === 'number' && originalPrice > price;
  }

  protected discountPercent(price: number, originalPrice: number | null): number | null {
    if (!this.hasDiscount(price, originalPrice)) {
      return null;
    }

    const original = originalPrice ?? price;
    return Math.round(((original - price) / original) * 100);
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

  protected cartEntryStatusLabel(offer: MarketplaceOfferModel): string {
    if (this.isOwnBusinessOffer(offer)) {
      return 'Your business offer';
    }

    return this.offerStatusLabel(offer.status);
  }

  protected resolveOfferImage(offer: MarketplaceOfferModel): string {
    return resolveOfferImage(offer.imageUrl, offer.id);
  }

  protected businessInitials(name: string): string {
    return buildBusinessMark(name);
  }

  protected businessIconUrl(iconUrl: string | null | undefined): string | null {
    return resolveBusinessIconUrl(iconUrl);
  }

  protected businessLocationLabel(offer: MarketplaceOfferModel): string {
    const city = offer.business.address.city || offer.pickupLocation.address.city;
    const distance = offer.distanceMeters === null ? null : this.formatDistance(offer.distanceMeters);

    if (city && distance) {
      return `${city} | ${distance}`;
    }

    if (city) {
      return city;
    }

    return distance ?? this.formatAddress(offer);
  }

  protected formatRating(value: number): string {
    return value.toFixed(1);
  }

  protected selectedQuantity(offerId: number, offer: MarketplaceOfferModel | null): number {
    return this.clampQuantity(this.selectedQuantities()[offerId] ?? 1, offer);
  }

  protected quantityOptions(offer: MarketplaceOfferModel): number[] {
    return Array.from({ length: this.maxQuantity(offer) }, (_, index) => index + 1);
  }

  protected availabilityLabel(offer: MarketplaceOfferModel): string {
    if (this.isOwnBusinessOffer(offer)) {
      return 'You cannot reserve your own offer';
    }

    if (!offer.canReserve || offer.quantityAvailable <= 0) {
      return 'Currently unavailable';
    }

    return `${offer.quantityAvailable} available now`;
  }

  protected entryPriceTotal(offer: MarketplaceOfferModel): number {
    return this.roundCurrency(offer.price * this.selectedQuantity(offer.id, offer));
  }

  protected entryOriginalPriceTotal(offer: MarketplaceOfferModel): number {
    return this.roundCurrency((offer.originalPrice ?? offer.price) * this.selectedQuantity(offer.id, offer));
  }

  private loadCartOffers(cartItems: readonly OfferCartItem[]): void {
    const offerIds = cartItems.map((item) => item.offerId);
    const requestedOfferIds = new Set(offerIds);
    const currentLoadSequence = ++this.loadSequence;

    if (!offerIds.length) {
      this.offers.set([]);
      this.marketplaceOffers.set([]);
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

          this.marketplaceOffers.set(offers);
          this.offers.set(offers.filter((offer) => requestedOfferIds.has(offer.id)));
          this.loading.set(false);
        },
        error: () => {
          if (currentLoadSequence !== this.loadSequence) {
            return;
          }

          this.loading.set(false);
          this.errorMessage.set('We could not refresh your cart right now. Please try again soon.');
          this.notificationService.error(
            'We could not refresh your cart right now. Please try again soon.',
            'Cart unavailable',
          );
        },
      });
  }

  private hasPaymentDetails(): boolean {
    return this.cardHolderName().trim().length >= 2 && this.cardLast4().length >= 4 && this.cardDigitsCount() >= 4;
  }

  private entrySavingsTotal(offer: MarketplaceOfferModel): number {
    return this.roundCurrency(
      Math.max((offer.originalPrice ?? offer.price) - offer.price, 0) * this.selectedQuantity(offer.id, offer),
    );
  }

  private clampQuantity(quantity: number, offer: MarketplaceOfferModel | null): number {
    const normalizedQuantity = Number.isFinite(quantity) ? Math.trunc(quantity) : 1;
    return Math.min(Math.max(normalizedQuantity, 1), this.maxQuantity(offer));
  }

  private maxQuantity(offer: MarketplaceOfferModel | null): number {
    if (!this.isOfferReadyForCheckout(offer)) {
      return 1;
    }

    return Math.max(1, offer.quantityAvailable);
  }

  protected isOfferReadyForCheckout(offer: MarketplaceOfferModel | null): offer is MarketplaceOfferModel {
    return !!offer && offer.canReserve && !this.isOwnBusinessOffer(offer);
  }

  protected isOwnBusinessOffer(offer: MarketplaceOfferModel | null): boolean {
    return !!offer && this.ownedBusinessIds().has(offer.business.id);
  }

  private resetCheckoutDraft(): void {
    this.cardHolderName.set('');
    this.cardLast4.set('');
    this.cardDigitsCount.set(0);
    this.cardExpiry.set('');
  }

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private isSameCalendarDay(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }
}
