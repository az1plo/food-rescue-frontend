import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
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

@Component({
  selector: 'app-business-reservations-page',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
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
  protected readonly business = signal<BusinessModel | null>(null);
  protected readonly cards = signal<BusinessOrderCardViewModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly confirmingIds = signal<number[]>([]);
  protected readonly pickupTokenDrafts = signal<Record<number, string>>({});
  protected readonly summary = computed(() => ({
    total: this.cards().length,
    active: this.cards().filter((card) => card.order.status === 'ACTIVE').length,
    completed: this.cards().filter((card) => card.order.status === 'PICKED_UP').length,
    cancelled: this.cards().filter((card) => card.order.status === 'CANCELLED').length,
  }));

  constructor() {
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

  protected hasSimulatedPayment(card: BusinessOrderCardViewModel): boolean {
    return card.order.payment !== null;
  }

  protected canConfirmPickup(card: BusinessOrderCardViewModel): boolean {
    if (card.order.status !== 'ACTIVE' || this.isConfirming(card.order.id)) {
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

    if (!payment.transferredToBusinessAt) {
      return 'Payout will move into business revenue as soon as pickup is confirmed.';
    }

    return `Payout transferred ${payment.transferredToBusinessAt}.`;
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

  protected cardEyebrow(card: BusinessOrderCardViewModel): string {
    return `Order #${card.order.id}`;
  }

  protected cardStatusLabel(card: BusinessOrderCardViewModel): string {
    if (card.order.status === 'ACTIVE') {
      return 'Awaiting pickup';
    }

    return ORDER_STATUS_META[card.order.status].label;
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
}
