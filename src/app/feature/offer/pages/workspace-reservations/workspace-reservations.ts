import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { buildBusinessMark, resolveBusinessIconUrl } from '../../../business/models/business.model';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { PickupPassCardComponent } from '../../../../shared/ui/pickup-pass-card/pickup-pass-card';
import { MarketplaceOfferModel } from '../../models/marketplace-offer.model';
import { resolveOfferImage } from '../../models/offer.model';
import { MarketplaceOfferApiService } from '../../services/marketplace-offer-api.service';
import {
  OrderModel,
  OrderPickupPassModel,
  OrderStatus,
  OrderStatusMeta,
  ORDER_STATUS_META,
} from '../../models/order.model';
import { OrderApiService } from '../../services/order-api.service';

interface OrderCardViewModel {
  order: OrderModel;
  statusMeta: OrderStatusMeta;
}

type PickupTab = 'upcoming' | 'completed' | 'cancelled';

@Component({
  selector: 'app-workspace-reservations-page',
  imports: [DatePipe, FontAwesomeModule, PickupPassCardComponent],
  templateUrl: './workspace-reservations.html',
  styleUrl: './workspace-reservations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceReservationsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly orderApi = inject(OrderApiService);
  private readonly marketplaceOfferApi = inject(MarketplaceOfferApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly notificationInbox = inject(NotificationInboxService);

  protected readonly icons = appIcons;
  protected readonly pickupTabs: PickupTab[] = ['upcoming', 'completed', 'cancelled'];
  protected readonly loadingSkeletonIds = [1, 2, 3] as const;
  protected readonly currentTimestamp = signal(Date.now());
  protected readonly orders = signal<OrderModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly businessIconLookup = signal<Record<number, string | null>>({});
  protected readonly marketplaceOfferLookup = signal<Record<number, MarketplaceOfferModel>>({});
  protected readonly pickupPassLookup = signal<Record<number, OrderPickupPassModel | null>>({});
  protected readonly pickupPassModalOrderId = signal<number | null>(null);
  protected readonly loadingPickupPassIds = signal<number[]>([]);
  protected readonly expandedDetailIds = signal<number[]>([]);
  protected readonly submittingReviewIds = signal<number[]>([]);
  protected readonly selectedPickupTab = signal<PickupTab>('upcoming');
  protected readonly reviewScale = [0, 1, 2, 3, 4, 5] as const;
  protected readonly cards = computed<OrderCardViewModel[]>(() =>
    this.orders().map((order) => ({
      order,
      statusMeta: ORDER_STATUS_META[order.status],
    })),
  );
  protected readonly summary = computed(() => ({
    total: this.orders().length,
    active: this.orders().filter((order) => this.isUpcomingOrder(order)).length,
    completed: this.orders().filter((order) => order.status === 'PICKED_UP').length,
    cancelled: this.orders().filter((order) => this.isPastPickupOrder(order)).length,
  }));
  protected readonly filteredCards = computed(() => {
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
  protected readonly pastPickupCount = computed(() => this.summary().completed + this.summary().cancelled);
  protected readonly pickupPassModalCard = computed(() => {
    const orderId = this.pickupPassModalOrderId();
    if (orderId === null) {
      return null;
    }

    return this.cards().find((card) => card.order.id === orderId) ?? null;
  });

  constructor() {
    this.loadOrders();
    const timeTicker = window.setInterval(() => {
      this.currentTimestamp.set(Date.now());
    }, 60_000);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(timeTicker);
    });
  }

  protected browseOffers(): void {
    void this.router.navigateByUrl('/browse-offers');
  }

  protected refreshOrders(): void {
    this.loadOrders();
  }

  protected selectPickupTab(tab: PickupTab): void {
    this.selectedPickupTab.set(tab);
  }

  protected tabLabel(tab: PickupTab): string {
    switch (tab) {
      case 'upcoming':
        return 'Upcoming';
      case 'completed':
        return 'Completed';
      default:
        return 'Cancelled';
    }
  }

  protected tabCount(tab: PickupTab): number {
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

  protected openPastPickups(): void {
    if (this.summary().completed > 0) {
      this.selectedPickupTab.set('completed');
      return;
    }

    if (this.summary().cancelled > 0) {
      this.selectedPickupTab.set('cancelled');
    }
  }

  protected primaryActionLabel(card: OrderCardViewModel): string {
    if (this.canShowPickupPass(card)) {
      return this.pickupPassButtonLabel(card.order.id);
    }

    return this.isDetailOpen(card.order.id) ? 'Hide details' : 'View details';
  }

  protected togglePrimaryAction(card: OrderCardViewModel): void {
    if (this.canShowPickupPass(card)) {
      this.togglePickupPass(card);
      return;
    }

    this.toggleDetails(card.order.id);
  }

  protected toggleDetails(orderId: number): void {
    this.expandedDetailIds.update((ids) =>
      ids.includes(orderId) ? ids.filter((existingId) => existingId !== orderId) : [...ids, orderId],
    );
  }

  protected isDetailOpen(orderId: number): boolean {
    return this.expandedDetailIds().includes(orderId);
  }

  protected canShowPickupPass(card: OrderCardViewModel): boolean {
    return this.isUpcomingOrder(card.order) && card.order.payment !== null;
  }

  protected togglePickupPass(card: OrderCardViewModel): void {
    if (!this.canShowPickupPass(card)) {
      return;
    }

    const orderId = card.order.id;
    if (this.isPickupPassOpen(orderId)) {
      this.closePickupPassModal();
      return;
    }

    this.pickupPassModalOrderId.set(orderId);

    if (this.pickupPassLookup()[orderId] !== undefined || this.isLoadingPickupPass(orderId)) {
      return;
    }

    this.loadingPickupPassIds.update((ids) => [...ids, orderId]);
    this.orderApi
      .getPickupPass(orderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pickupPass) => {
          this.pickupPassLookup.update((lookup) => ({
            ...lookup,
            [orderId]: pickupPass,
          }));
          this.loadingPickupPassIds.update((ids) => ids.filter((id) => id !== orderId));
        },
        error: () => {
          this.pickupPassLookup.update((lookup) => ({
            ...lookup,
            [orderId]: null,
          }));
          this.loadingPickupPassIds.update((ids) => ids.filter((id) => id !== orderId));
          this.notificationService.error('Pickup code could not be loaded right now.');
        },
      });
  }

  protected closePickupPassModal(): void {
    this.pickupPassModalOrderId.set(null);
  }

  protected isPickupPassOpen(orderId: number): boolean {
    return this.pickupPassModalOrderId() === orderId;
  }

  protected isLoadingPickupPass(orderId: number): boolean {
    return this.loadingPickupPassIds().includes(orderId);
  }

  protected pickupPass(orderId: number): OrderPickupPassModel | null {
    return this.pickupPassLookup()[orderId] ?? null;
  }

  protected paymentSummary(order: OrderModel): string {
    const payment = order.payment;
    if (!payment) {
      return 'Payment details are not available for this pickup.';
    }

    return `${this.formatCurrencyValue(payment.amount, payment.currency)} paid with card ending ${payment.cardLast4}.`;
  }

  protected pickupPassButtonLabel(orderId: number): string {
    if (this.isLoadingPickupPass(orderId)) {
      return 'Loading pickup code...';
    }

    return this.isPickupPassOpen(orderId) ? 'Hide pickup code' : 'Show pickup code';
  }

  protected pickupStatusPillLabel(card: OrderCardViewModel): string {
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

  protected pickupStatusTone(card: OrderCardViewModel): OrderStatusMeta['tone'] {
    if (this.isPickupWindowExpired(card.order)) {
      return 'warning';
    }

    return card.statusMeta.tone;
  }

  protected pickupDateLabel(order: OrderModel): string {
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

  protected pickupTimeLabel(order: OrderModel): string {
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

  protected pickupAddressPrimary(order: OrderModel): string {
    return order.pickupLocation.address.street || 'Address unavailable';
  }

  protected pickupAddressSecondary(order: OrderModel): string {
    return [
      order.pickupLocation.address.city,
      order.pickupLocation.address.postalCode,
      order.pickupLocation.address.country,
    ]
      .filter(Boolean)
      .join(', ');
  }

  protected businessLocationLabel(order: OrderModel): string {
    return [order.pickupLocation.address.city, order.pickupLocation.address.country].filter(Boolean).join(', ');
  }

  protected businessInitials(order: OrderModel): string {
    return buildBusinessMark(order.businessName);
  }

  protected businessIconUrl(businessId: number): string | null {
    return this.businessIconLookup()[businessId] ?? null;
  }

  protected isPastDueActiveOrder(order: OrderModel): boolean {
    return this.isPickupWindowExpired(order);
  }

  protected resolveOfferTitle(card: OrderCardViewModel): string {
    return card.order.item.title;
  }

  protected resolveOfferDescription(card: OrderCardViewModel): string {
    if (card.order.pickupLocation.note?.trim()) {
      return card.order.pickupLocation.note;
    }

    return `Pickup from ${card.order.businessName}.`;
  }

  protected resolveOfferImage(card: OrderCardViewModel): string {
    return resolveOfferImage(card.order.item.imageUrl, card.order.item.offerId);
  }

  protected openDirections(card: OrderCardViewModel): void {
    const addressQuery = [
      card.order.pickupLocation.address.street,
      card.order.pickupLocation.address.city,
      card.order.pickupLocation.address.postalCode,
      card.order.pickupLocation.address.country,
    ]
      .filter(Boolean)
      .join(', ');

    if (!addressQuery) {
      this.notificationService.info('Directions will open when map integration is available.');
      return;
    }

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`;
    window.open(mapsUrl, '_blank', 'noopener,noreferrer');
  }

  protected contactBusiness(_card: OrderCardViewModel): void {
    this.notificationService.info('Contact details are not available for this pickup.');
  }

  protected canReview(order: OrderModel): boolean {
    return order.status === 'PICKED_UP' && order.review === null && !this.isSubmittingReview(order.id);
  }

  protected isSubmittingReview(orderId: number): boolean {
    return this.submittingReviewIds().includes(orderId);
  }

  protected submitReview(order: OrderModel, rating: number): void {
    if (!this.canReview(order)) {
      return;
    }

    this.submittingReviewIds.update((ids) => [...ids, order.id]);
    this.orderApi
      .submitReview(order.id, { rating, comment: null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedOrder) => {
          this.submittingReviewIds.update((ids) => ids.filter((id) => id !== order.id));
          this.orders.update((orders) =>
            orders.map((existingOrder) => (existingOrder.id === updatedOrder.id ? updatedOrder : existingOrder)),
          );
          this.notificationService.success(
            `Your ${rating}/5 rating for ${order.businessName} was saved.`,
            'Thanks for rating',
          );
          this.notificationInbox.refresh();
        },
        error: () => {
          this.submittingReviewIds.update((ids) => ids.filter((id) => id !== order.id));
          this.notificationService.error('Your business rating could not be saved right now.');
        },
      });
  }

  protected reviewSummary(order: OrderModel): string | null {
    const review = order.review;
    if (!review) {
      return null;
    }

    return `${review.rating}/5 rated on ${new Date(review.createdAt).toLocaleDateString('en-US')}`;
  }

  protected formatPrice(price: number | null | undefined): string {
    return typeof price === 'number' ? this.formatCurrencyValue(price, 'EUR') : 'Price unavailable';
  }

  protected formattedOriginalPrice(order: OrderModel): string | null {
    const originalPrice = this.originalPrice(order);
    return typeof originalPrice === 'number' && originalPrice > order.item.unitPrice ? this.formatPrice(originalPrice) : null;
  }

  protected discountPercent(order: OrderModel): number | null {
    const originalPrice = this.originalPrice(order);
    if (typeof originalPrice !== 'number' || originalPrice <= order.item.unitPrice) {
      return null;
    }

    return Math.round(((originalPrice - order.item.unitPrice) / originalPrice) * 100);
  }

  protected formatPickupPassAmount(amount: number, currency: string): string {
    return this.formatCurrencyValue(amount, currency);
  }

  private loadOrders(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.businessIconLookup.set({});
    this.marketplaceOfferLookup.set({});
    this.pickupPassLookup.set({});
    this.pickupPassModalOrderId.set(null);
    this.loadingPickupPassIds.set([]);
    this.expandedDetailIds.set([]);

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
