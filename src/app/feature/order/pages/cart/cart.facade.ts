import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BusinessWorkspaceStateService } from '../../../../core/services/business-workspace-state.service';
import { MarketplaceOfferApiService } from '../../../../core/services/marketplace-offer-api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { OfferCartItem, OfferCartService } from '../../../../core/services/offer-cart.service';
import { buildBusinessMark, resolveBusinessIconUrl } from '../../../../shared/models/business.model';
import { MarketplaceOfferModel } from '../../../../shared/models/marketplace-offer.model';
import { OfferStatus, resolveOfferImage } from '../../../../shared/models/offer.model';

interface CartEntryViewModel {
  offerId: number;
  addedAt: string;
  offer: MarketplaceOfferModel | null;
}

interface PickupScheduleEntryViewModel {
  offerId: number;
  offer: MarketplaceOfferModel;
}

@Injectable()
export class CartFacade {
  private readonly destroyRef = inject(DestroyRef);
  private readonly offerCart = inject(OfferCartService);
  private readonly marketplaceOfferApi = inject(MarketplaceOfferApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly currencyFormatter = new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  private loadSequence = 0;

  readonly cartItems = this.offerCart.items;
  readonly ownedBusinessIds = computed(
    () => new Set(this.businessWorkspaceState.knownBusinesses().map((business) => business.id)),
  );
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly offers = signal<MarketplaceOfferModel[]>([]);
  readonly marketplaceOffers = signal<MarketplaceOfferModel[]>([]);
  readonly selectedQuantities = signal<Record<number, number>>({});
  readonly loadingSkeletonIds = [1, 2, 3];

  readonly cartEntries = computed<CartEntryViewModel[]>(() => {
    const offersById = new Map(this.offers().map((offer) => [offer.id, offer]));
    return this.cartItems().map((item) => ({
      offerId: item.offerId,
      addedAt: item.addedAt,
      offer: offersById.get(item.offerId) ?? null,
    }));
  });

  readonly checkoutReadyEntries = computed<(CartEntryViewModel & { offer: MarketplaceOfferModel })[]>(() =>
    this.cartEntries().filter(
      (entry): entry is CartEntryViewModel & { offer: MarketplaceOfferModel } => this.isOfferReadyForCheckout(entry.offer),
    ),
  );
  readonly subtotal = computed(
    () => this.checkoutReadyEntries().reduce((sum, entry) => sum + this.entryPriceTotal(entry.offer), 0),
  );
  readonly serviceFee = computed(() => 0);
  readonly estimatedTax = computed(() => 0);
  readonly checkoutItemCount = computed(
    () => this.checkoutReadyEntries().reduce((sum, entry) => sum + this.selectedQuantity(entry.offer.id, entry.offer), 0),
  );
  readonly totalSavings = computed(() =>
    this.roundCurrency(
      this.checkoutReadyEntries().reduce(
        (sum, entry) => sum + this.entrySavingsTotal(entry.offer),
        0,
      ),
    ),
  );
  readonly checkoutGrandTotal = computed(() =>
    this.roundCurrency(this.subtotal() + this.serviceFee() + this.estimatedTax()),
  );
  readonly checkoutOriginalTotal = computed(() =>
    this.roundCurrency(this.checkoutGrandTotal() + this.totalSavings()),
  );
  readonly hasBlockingLoadError = computed(
    () => Boolean(this.errorMessage()) && !this.loading() && !this.offers().length && this.cartItems().length > 0,
  );
  readonly pickupScheduleEntries = computed<PickupScheduleEntryViewModel[]>(() => {
    const source = this.checkoutReadyEntries().length
      ? this.checkoutReadyEntries()
      : this.cartEntries().filter(
        (entry): entry is CartEntryViewModel & { offer: MarketplaceOfferModel } => entry.offer !== null,
      );

    return source.map((entry) => ({
      offerId: entry.offerId,
      offer: entry.offer,
    }));
  });
  readonly suggestedOffers = computed(() => {
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
  }

  hasOffer(offerId: number): boolean {
    return this.offerCart.hasOffer(offerId);
  }

  addOffer(offerId: number): void {
    this.offerCart.addOffer(offerId);
  }

  removeOffer(offerId: number): void {
    this.offerCart.removeOffer(offerId);
  }

  clearCart(): void {
    this.offerCart.clear();
  }

  updateEntryQuantity(offerId: number, offer: MarketplaceOfferModel, value: string): void {
    const parsedValue = Number(value);
    this.selectedQuantities.update((quantities) => ({
      ...quantities,
      [offerId]: this.clampQuantity(parsedValue, offer),
    }));
  }

  formatPrice(price: number): string {
    return this.currencyFormatter.format(price);
  }

  hasDiscount(price: number, originalPrice: number | null): boolean {
    return typeof originalPrice === 'number' && originalPrice > price;
  }

  discountPercent(price: number, originalPrice: number | null): number | null {
    if (!this.hasDiscount(price, originalPrice)) {
      return null;
    }

    const original = originalPrice ?? price;
    return Math.round(((original - price) / original) * 100);
  }

  formatDistance(distanceMeters: number | null): string {
    if (distanceMeters === null) {
      return 'Distance unavailable';
    }

    if (distanceMeters < 1000) {
      return `${Math.round(distanceMeters)} m away`;
    }

    return `${(distanceMeters / 1000).toFixed(1)} km away`;
  }

  formatAddress(offer: MarketplaceOfferModel): string {
    return [
      offer.pickupLocation.address.street,
      offer.pickupLocation.address.city,
      offer.pickupLocation.address.country,
    ]
      .filter(Boolean)
      .join(', ');
  }

  formatOfferPickupWindow(offer: MarketplaceOfferModel): string {
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

  cartEntryStatusLabel(offer: MarketplaceOfferModel): string {
    if (this.isOwnBusinessOffer(offer)) {
      return 'Your business offer';
    }

    return this.offerStatusLabel(offer.status);
  }

  resolveOfferImage(offer: MarketplaceOfferModel): string {
    return resolveOfferImage(offer.imageUrl, offer.id);
  }

  businessInitials(name: string): string {
    return buildBusinessMark(name);
  }

  businessIconUrl(iconUrl: string | null | undefined): string | null {
    return resolveBusinessIconUrl(iconUrl);
  }

  businessLocationLabel(offer: MarketplaceOfferModel): string {
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

  formatRating(value: number): string {
    return value.toFixed(1);
  }

  selectedQuantity(offerId: number, offer: MarketplaceOfferModel | null): number {
    return this.clampQuantity(this.selectedQuantities()[offerId] ?? 1, offer);
  }

  quantityOptions(offer: MarketplaceOfferModel): number[] {
    return Array.from({ length: this.maxQuantity(offer) }, (_, index) => index + 1);
  }

  availabilityLabel(offer: MarketplaceOfferModel): string {
    if (this.isOwnBusinessOffer(offer)) {
      return 'You cannot reserve your own offer';
    }

    if (!offer.canReserve || offer.quantityAvailable <= 0) {
      return 'Currently unavailable';
    }

    return `${offer.quantityAvailable} available now`;
  }

  entryPriceTotal(offer: MarketplaceOfferModel): number {
    return this.roundCurrency(offer.price * this.selectedQuantity(offer.id, offer));
  }

  entryOriginalPriceTotal(offer: MarketplaceOfferModel): number {
    return this.roundCurrency((offer.originalPrice ?? offer.price) * this.selectedQuantity(offer.id, offer));
  }

  isOfferReadyForCheckout(offer: MarketplaceOfferModel | null): offer is MarketplaceOfferModel {
    return !!offer && offer.canReserve && !this.isOwnBusinessOffer(offer);
  }

  isOwnBusinessOffer(offer: MarketplaceOfferModel | null): boolean {
    return !!offer && this.ownedBusinessIds().has(offer.business.id);
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

  private offerStatusLabel(status: OfferStatus): string {
    return status
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
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

  private roundCurrency(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private isSameCalendarDay(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }
}
