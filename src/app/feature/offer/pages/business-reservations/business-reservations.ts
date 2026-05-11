import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { BusinessModel } from '../../../business/models/business.model';
import { BusinessWorkspaceStateService } from '../../../business/services/business-workspace-state.service';
import { resolveOfferImage } from '../../models/offer.model';
import {
  OrderModel,
  OrderStatusMeta,
  ORDER_STATUS_META,
} from '../../models/order.model';
import { OrderApiService } from '../../services/order-api.service';

interface BusinessOrderCardViewModel {
  order: OrderModel;
  statusMeta: OrderStatusMeta;
}

type BusinessOrdersTab = 'all' | 'active' | 'completed' | 'cancelled';

@Component({
  selector: 'app-business-reservations-page',
  imports: [DatePipe, FontAwesomeModule, RouterLink],
  templateUrl: './business-reservations.html',
  styleUrl: './business-reservations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessReservationsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly orderApi = inject(OrderApiService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly notificationService = inject(NotificationService);
  private readonly notificationInbox = inject(NotificationInboxService);

  protected readonly icons = appIcons;
  protected readonly loadingSkeletonIds = [1, 2, 3] as const;
  protected readonly orderTabs: BusinessOrdersTab[] = ['all', 'active', 'completed', 'cancelled'];
  protected readonly currentTimestamp = signal(Date.now());
  protected readonly business = signal<BusinessModel | null>(null);
  protected readonly cards = signal<BusinessOrderCardViewModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly confirmingIds = signal<number[]>([]);
  protected readonly pickupTokenDrafts = signal<Record<number, string>>({});
  protected readonly selectedOrderTab = signal<BusinessOrdersTab>('all');
  protected readonly summary = computed(() => ({
    total: this.cards().length,
    active: this.cards().filter((card) => this.isUpcomingActiveOrder(card.order)).length,
    completed: this.cards().filter((card) => card.order.status === 'PICKED_UP').length,
    cancelled: this.cards().filter((card) => this.isPastPickupOrder(card.order)).length,
  }));
  protected readonly filteredCards = computed(() => {
    const tab = this.selectedOrderTab();

    return this.cards().filter((card) => {
      if (tab === 'all') {
        return true;
      }

      if (tab === 'active') {
        return this.isUpcomingActiveOrder(card.order);
      }

      if (tab === 'completed') {
        return card.order.status === 'PICKED_UP';
      }

      return this.isPastPickupOrder(card.order);
    });
  });

  constructor() {
    const timeTicker = window.setInterval(() => {
      this.currentTimestamp.set(Date.now());
    }, 60_000);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(timeTicker);
    });

    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      const resolvedBusiness = (data['business'] as BusinessModel | null | undefined) ?? null;
      if (!resolvedBusiness) {
        this.business.set(null);
        this.cards.set([]);
        this.loading.set(false);
        this.errorMessage.set('Business orders could not be opened right now.');
        return;
      }

      this.business.set(resolvedBusiness);
      this.businessWorkspaceState.rememberBusinessId(resolvedBusiness.id);
      this.businessWorkspaceState.rememberBusinessSummary(resolvedBusiness);
      this.loadOrders();
    });
  }

  protected refreshOrders(): void {
    this.loadOrders();
  }

  protected selectOrderTab(tab: BusinessOrdersTab): void {
    this.selectedOrderTab.set(tab);
  }

  protected tabLabel(tab: BusinessOrdersTab): string {
    switch (tab) {
      case 'all':
        return 'All orders';
      case 'active':
        return 'Awaiting pickup';
      case 'completed':
        return 'Picked up';
      default:
        return 'Cancelled';
    }
  }

  protected tabCount(tab: BusinessOrdersTab): number {
    const summary = this.summary();

    switch (tab) {
      case 'all':
        return summary.total;
      case 'active':
        return summary.active;
      case 'completed':
        return summary.completed;
      default:
        return summary.cancelled;
    }
  }

  protected emptyTabTitle(): string {
    switch (this.selectedOrderTab()) {
      case 'all':
        return 'No orders yet';
      case 'active':
        return 'No pickups waiting right now';
      case 'completed':
        return 'No picked up orders yet';
      default:
        return 'No cancelled orders';
    }
  }

  protected emptyTabCopy(): string {
    switch (this.selectedOrderTab()) {
      case 'all':
        return 'This business does not have any customer orders yet. As soon as an offer is paid, it will appear here.';
      case 'active':
        return 'All current paid orders are already processed, or their pickup windows have already ended.';
      case 'completed':
        return 'Completed pickups will appear here after collection is confirmed.';
      default:
        return 'Cancelled and no-show orders will appear here when an order does not reach pickup.';
    }
  }

  protected confirmPickup(card: BusinessOrderCardViewModel): void {
    if (!this.canConfirmPickup(card)) {
      return;
    }

    this.confirmingIds.update((ids) => [...ids, card.order.id]);
    this.orderApi
      .confirmPickup(card.order.id, this.pickupTokenValue(card.order.id))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmingIds.update((ids) => ids.filter((id) => id !== card.order.id));
          this.pickupTokenDrafts.update((drafts) => ({
            ...drafts,
            [card.order.id]: '',
          }));
          this.notificationService.success('Pickup was confirmed for this order.', 'Order updated');
          this.notificationInbox.refresh();
          this.loadOrders();
        },
        error: () => {
          this.confirmingIds.update((ids) => ids.filter((id) => id !== card.order.id));
          this.notificationService.error('Pickup confirmation could not be completed.');
        },
      });
  }

  protected isConfirming(id: number): boolean {
    return this.confirmingIds().includes(id);
  }

  protected updatePickupToken(orderId: number, value: string): void {
    this.pickupTokenDrafts.update((drafts) => ({
      ...drafts,
      [orderId]: value,
    }));
  }

  protected pickupTokenValue(orderId: number): string {
    return this.pickupTokenDrafts()[orderId] ?? '';
  }

  protected canConfirmPickup(card: BusinessOrderCardViewModel): boolean {
    if (!this.canVerifyPickup(card) || this.isConfirming(card.order.id)) {
      return false;
    }

    if (!card.order.payment) {
      return false;
    }

    return !!this.pickupTokenValue(card.order.id).trim();
  }

  protected confirmPickupLabel(card: BusinessOrderCardViewModel): string {
    if (this.isConfirming(card.order.id)) {
      return 'Confirming...';
    }

    return 'Confirm pickup';
  }

  protected paymentSummary(card: BusinessOrderCardViewModel): string {
    const payment = card.order.payment;
    if (!payment) {
      return 'Payment record unavailable.';
    }

    return `${payment.amount.toFixed(2)} ${payment.currency} captured with card ending ${payment.cardLast4}.`;
  }

  protected payoutSummary(card: BusinessOrderCardViewModel): string {
    const payment = card.order.payment;
    if (!payment) {
      return 'Payout record unavailable.';
    }

    if (this.isExpiredUnconfirmedOrder(card.order)) {
      if (!payment.transferredToBusinessAt) {
        return 'Pickup window ended without confirmation. This payout will be assigned to the business under the no-show policy.';
      }

      return `Pickup window ended without confirmation. Payout was assigned to the business on ${this.formatDateTime(payment.transferredToBusinessAt)}.`;
    }

    if (!payment.transferredToBusinessAt) {
      return 'Payout will move into business revenue as soon as pickup is confirmed.';
    }

    return `Payout transferred ${this.formatDateTime(payment.transferredToBusinessAt)}.`;
  }

  protected resolveOfferImage(card: BusinessOrderCardViewModel): string {
    return resolveOfferImage(card.order.item.imageUrl, card.order.item.offerId);
  }

  protected offerItemsSummary(card: BusinessOrderCardViewModel): string {
    return `${card.order.item.quantity}x ${card.order.item.title}`;
  }

  protected formatPrice(value: number): string {
    return `${value.toFixed(2)} EUR`;
  }

  protected secondaryAddressLine(card: BusinessOrderCardViewModel): string {
    return [
      card.order.pickupLocation.address.city,
      card.order.pickupLocation.address.postalCode,
      card.order.pickupLocation.address.country,
    ]
      .filter(Boolean)
      .join(', ');
  }

  protected cardEyebrow(card: BusinessOrderCardViewModel): string {
    return `Order #${card.order.id}`;
  }

  protected cardStatusLabel(card: BusinessOrderCardViewModel): string {
    if (this.isExpiredUnconfirmedOrder(card.order)) {
      return 'Pickup ended';
    }

    if (card.order.status === 'ACTIVE') {
      return 'Awaiting pickup';
    }

    return ORDER_STATUS_META[card.order.status].label;
  }

  protected cardTone(card: BusinessOrderCardViewModel): OrderStatusMeta['tone'] {
    if (this.isExpiredUnconfirmedOrder(card.order) || card.order.status === 'NO_SHOW') {
      return 'warning';
    }

    return card.statusMeta.tone;
  }

  protected canVerifyPickup(card: BusinessOrderCardViewModel): boolean {
    return card.order.status === 'ACTIVE' && !this.isPickupWindowExpired(card.order) && !!card.order.payment;
  }

  protected isExpiredUnconfirmedOrder(order: OrderModel): boolean {
    return this.isPickupWindowExpired(order);
  }

  protected expiredPickupTitle(card: BusinessOrderCardViewModel): string {
    if (card.order.status === 'NO_SHOW') {
      return 'No-show recorded';
    }

    return 'Pickup window ended';
  }

  protected expiredPickupSummary(card: BusinessOrderCardViewModel): string {
    const pickupWindowEnd = this.formatDateTime(card.order.pickupTimeWindow.to);
    if (card.order.status === 'NO_SHOW') {
      return `This order was not collected during the pickup window. Pickup ended on ${pickupWindowEnd}.`;
    }

    return `This order was not confirmed before the pickup window ended on ${pickupWindowEnd}.`;
  }

  protected expiredPickupResolution(card: BusinessOrderCardViewModel): string {
    const transferredAt = card.order.payment?.transferredToBusinessAt;
    if (transferredAt) {
      return `Payout was assigned to the business on ${this.formatDateTime(transferredAt)} under the no-show policy.`;
    }

    return 'This missed pickup will be settled as a no-show, and the payout will be released to the business.';
  }

  private loadOrders(): void {
    const business = this.business();
    if (!business) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    this.pickupTokenDrafts.set({});

    this.orderApi
      .getOrders(business.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cards) => {
          const sortedCards = [...cards].sort(
            (first, second) => this.toTimestamp(second.createdAt) - this.toTimestamp(first.createdAt),
          );

          this.cards.set(sortedCards.map((order) => ({
            order,
            statusMeta: ORDER_STATUS_META[order.status],
          })));
          this.loading.set(false);
        },
        error: () => {
          this.cards.set([]);
          this.loading.set(false);
          this.errorMessage.set('We could not load orders for this business right now. Please try again.');
        },
      });
  }

  private toTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  private isCancelledOrder(status: OrderModel['status']): boolean {
    return status === 'CANCELLED' || status === 'NO_SHOW';
  }

  private isUpcomingActiveOrder(order: OrderModel): boolean {
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

  private formatDateTime(value: string): string {
    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsedDate);
  }
}
