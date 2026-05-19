import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MarketplaceOfferApiService } from '../../../../core/services/marketplace-offer-api.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { buildBusinessMark, resolveBusinessIconUrl } from '../../../../shared/models/business.model';
import { MarketplaceOfferModel } from '../../../../shared/models/marketplace-offer.model';
import { resolveOfferImage } from '../../../../shared/models/offer.model';
import {
  OrderModel,
  OrderStatus,
  OrderStatusMeta,
  ORDER_STATUS_META,
} from '../../models/order.model';
import { OrderApiService } from '../../services/order-api.service';

export interface WorkspaceReservationCardViewModel {
  order: OrderModel;
  statusMeta: OrderStatusMeta;
}

export type WorkspacePickupTab = 'upcoming' | 'completed' | 'cancelled';

@Injectable()
export class WorkspaceReservationsFacade {
  private readonly destroyRef = inject(DestroyRef);
  private readonly orderApi = inject(OrderApiService);
  private readonly marketplaceOfferApi = inject(MarketplaceOfferApiService);
  private readonly notificationService = inject(NotificationService);

  private readonly currentTimestamp = signal(Date.now());

  readonly orders = signal<OrderModel[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly businessIconLookup = signal<Record<number, string | null>>({});
  readonly marketplaceOfferLookup = signal<Record<number, MarketplaceOfferModel>>({});
  readonly selectedPickupTab = signal<WorkspacePickupTab>('upcoming');
  readonly cards = computed<WorkspaceReservationCardViewModel[]>(() =>
    this.orders().map((order) => ({
      order,
      statusMeta: ORDER_STATUS_META[order.status],
    })),
  );
  readonly summary = computed(() => ({
    total: this.orders().length,
    active: this.orders().filter((order) => this.isUpcomingOrder(order)).length,
    completed: this.orders().filter((order) => order.status === 'PICKED_UP').length,
    cancelled: this.orders().filter((order) => this.isPastPickupOrder(order)).length,
  }));
  readonly filteredCards = computed(() => {
    const tab = this.selectedPickupTab();

    return this.cards().filter((card) => {
      if (tab === 'upcoming') {
        return this.isUpcomingOrder(card.order);
      }

      if (tab === 'completed') {
        return card.order.status === 'PICKED_UP';
      }

      return this.isPastPickupOrder(card.order);
    });
  });
  readonly pastPickupCount = computed(() => this.summary().completed + this.summary().cancelled);

  constructor() {
    this.loadOrders();

    const timeTicker = window.setInterval(() => {
      this.currentTimestamp.set(Date.now());
    }, 60_000);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(timeTicker);
    });
  }

  refreshOrders(): void {
    this.loadOrders();
  }

  selectPickupTab(tab: WorkspacePickupTab): void {
    this.selectedPickupTab.set(tab);
  }

  replaceOrder(updatedOrder: OrderModel): void {
    this.orders.update((orders) =>
      orders.map((existingOrder) => (existingOrder.id === updatedOrder.id ? updatedOrder : existingOrder)),
    );
  }

  tabLabel(tab: WorkspacePickupTab): string {
    switch (tab) {
      case 'upcoming':
        return 'Upcoming';
      case 'completed':
        return 'Completed';
      default:
        return 'Cancelled';
    }
  }

  tabCount(tab: WorkspacePickupTab): number {
    const summary = this.summary();

    switch (tab) {
      case 'upcoming':
        return summary.active;
      case 'completed':
        return summary.completed;
      default:
        return summary.cancelled;
    }
  }

  canShowPickupPass(card: WorkspaceReservationCardViewModel): boolean {
    return this.isUpcomingOrder(card.order) && card.order.payment !== null;
  }

  paymentSummary(order: OrderModel): string {
    const payment = order.payment;
    if (!payment) {
      return 'Payment details are not available for this pickup.';
    }

    return `${this.formatCurrencyValue(payment.amount, payment.currency)} paid with card ending ${payment.cardLast4}.`;
  }

  pickupStatusPillLabel(card: WorkspaceReservationCardViewModel): string {
    if (card.order.status === 'NO_SHOW') {
      return 'Pickup missed';
    }

    if (this.isPickupWindowExpired(card.order)) {
      return 'Pickup ended';
    }

    if (card.order.status === 'ACTIVE') {
      if (this.isToday(card.order.pickupTimeWindow.from)) {
        return 'Today';
      }

      if (this.isTomorrow(card.order.pickupTimeWindow.from)) {
        return 'Tomorrow';
      }

      return 'Upcoming';
    }

    if (card.order.status === 'PICKED_UP') {
      return 'Completed';
    }

    return 'Cancelled';
  }

  pickupStatusTone(card: WorkspaceReservationCardViewModel): OrderStatusMeta['tone'] {
    if (this.isPickupWindowExpired(card.order)) {
      return 'warning';
    }

    return card.statusMeta.tone;
  }

  pickupDateLabel(order: OrderModel): string {
    const pickupDate = new Date(order.pickupTimeWindow.from);
    if (Number.isNaN(pickupDate.getTime())) {
      return 'Pickup date unavailable';
    }

    if (this.isToday(order.pickupTimeWindow.from)) {
      return 'Today';
    }

    if (this.isTomorrow(order.pickupTimeWindow.from)) {
      return 'Tomorrow';
    }

    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(pickupDate);
  }

  pickupTimeLabel(order: OrderModel): string {
    const from = new Date(order.pickupTimeWindow.from);
    const to = new Date(order.pickupTimeWindow.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return 'Pickup window unavailable';
    }

    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    return `${timeFormatter.format(from)} - ${timeFormatter.format(to)}`;
  }

  pickupAddressPrimary(order: OrderModel): string {
    return order.pickupLocation.address.street || 'Address unavailable';
  }

  pickupAddressSecondary(order: OrderModel): string {
    return [
      order.pickupLocation.address.city,
      order.pickupLocation.address.postalCode,
      order.pickupLocation.address.country,
    ]
      .filter(Boolean)
      .join(', ');
  }

  businessLocationLabel(order: OrderModel): string {
    return [order.pickupLocation.address.city, order.pickupLocation.address.country].filter(Boolean).join(', ');
  }

  businessInitials(order: OrderModel): string {
    return buildBusinessMark(order.businessName);
  }

  businessIconUrl(businessId: number): string | null {
    return this.businessIconLookup()[businessId] ?? null;
  }

  isPastDueActiveOrder(order: OrderModel): boolean {
    return this.isPickupWindowExpired(order);
  }

  resolveOfferTitle(card: WorkspaceReservationCardViewModel): string {
    return card.order.item.title;
  }

  resolveOfferDescription(card: WorkspaceReservationCardViewModel): string {
    if (card.order.pickupLocation.note?.trim()) {
      return card.order.pickupLocation.note;
    }

    return `Pickup from ${card.order.businessName}.`;
  }

  resolveOfferImage(card: WorkspaceReservationCardViewModel): string {
    return resolveOfferImage(card.order.item.imageUrl, card.order.item.offerId);
  }

  reviewSummary(order: OrderModel): string | null {
    const review = order.review;
    if (!review) {
      return null;
    }

    return `${review.rating}/5 rated on ${new Date(review.createdAt).toLocaleDateString('en-US')}`;
  }

  formatPrice(price: number | null | undefined): string {
    return typeof price === 'number' ? this.formatCurrencyValue(price, 'EUR') : 'Price unavailable';
  }

  formattedOriginalPrice(order: OrderModel): string | null {
    const originalPrice = this.originalPrice(order);
    return typeof originalPrice === 'number' && originalPrice > order.item.unitPrice ? this.formatPrice(originalPrice) : null;
  }

  discountPercent(order: OrderModel): number | null {
    const originalPrice = this.originalPrice(order);
    if (typeof originalPrice !== 'number' || originalPrice <= order.item.unitPrice) {
      return null;
    }

    return Math.round(((originalPrice - order.item.unitPrice) / originalPrice) * 100);
  }

  formatPickupPassAmount(amount: number, currency: string): string {
    return this.formatCurrencyValue(amount, currency);
  }

  private loadOrders(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.businessIconLookup.set({});
    this.marketplaceOfferLookup.set({});

    this.orderApi
      .getOrders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => {
          const sortedOrders = [...orders].sort(
            (first, second) => this.toTimestamp(second.createdAt) - this.toTimestamp(first.createdAt),
          );

          this.orders.set(sortedOrders);
          this.loadBusinessIcons(sortedOrders);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.orders.set([]);
          this.errorMessage.set('We could not load your pickup history right now. Please try again.');
          this.notificationService.error('We could not load your pickup history right now. Please try again.');
        },
      });
  }

  private loadBusinessIcons(orders: readonly OrderModel[]): void {
    const businessIds = new Set(orders.map((order) => order.businessId).filter((businessId) => businessId > 0));
    const offerIds = new Set(orders.map((order) => order.item.offerId).filter((offerId) => offerId > 0));

    if (!businessIds.size && !offerIds.size) {
      this.businessIconLookup.set({});
      return;
    }

    this.marketplaceOfferApi
      .getMarketplaceOffers({
        includeUnavailable: true,
        sort: 'NEWEST',
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (offers) => {
          const relevantOffers = offers.filter((offer) => offerIds.has(offer.id) || businessIds.has(offer.business.id));
          const marketplaceOfferLookup = relevantOffers.reduce<Record<number, MarketplaceOfferModel>>((lookup, offer) => {
            lookup[offer.id] = offer;
            return lookup;
          }, {});
          const nextLookup = offers.reduce<Record<number, string | null>>((lookup, offer) => {
            const matchesOrder = offerIds.has(offer.id) || businessIds.has(offer.business.id);
            if (!matchesOrder || lookup[offer.business.id] !== undefined) {
              return lookup;
            }

            lookup[offer.business.id] = resolveBusinessIconUrl(offer.business.iconUrl);
            return lookup;
          }, {});

          this.marketplaceOfferLookup.set(marketplaceOfferLookup);
          this.businessIconLookup.set(nextLookup);
        },
        error: () => {
          this.marketplaceOfferLookup.set({});
          this.businessIconLookup.set({});
        },
      });
  }

  private originalPrice(order: OrderModel): number | null {
    return this.marketplaceOfferLookup()[order.item.offerId]?.originalPrice ?? null;
  }

  private formatCurrencyValue(amount: number, currency: string): string {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  private isToday(value: string): boolean {
    return this.isSameCalendarDay(new Date(value), this.currentDate());
  }

  private isTomorrow(value: string): boolean {
    const tomorrow = this.currentDate();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.isSameCalendarDay(new Date(value), tomorrow);
  }

  private isCancelledOrder(status: OrderStatus): boolean {
    return status === 'CANCELLED' || status === 'NO_SHOW';
  }

  private isUpcomingOrder(order: OrderModel): boolean {
    return order.status === 'ACTIVE' && !this.isPickupWindowExpired(order);
  }

  private isPastPickupOrder(order: OrderModel): boolean {
    return this.isCancelledOrder(order.status) || this.isPickupWindowExpired(order);
  }

  private isPickupWindowExpired(order: OrderModel): boolean {
    if (order.status !== 'ACTIVE') {
      return false;
    }

    const pickupWindowEnd = new Date(order.pickupTimeWindow.to);
    if (Number.isNaN(pickupWindowEnd.getTime())) {
      return false;
    }

    return pickupWindowEnd.getTime() <= this.currentTimestamp();
  }

  private currentDate(): Date {
    return new Date(this.currentTimestamp());
  }

  private isSameCalendarDay(first: Date, second: Date): boolean {
    if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) {
      return false;
    }

    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }

  private toTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
