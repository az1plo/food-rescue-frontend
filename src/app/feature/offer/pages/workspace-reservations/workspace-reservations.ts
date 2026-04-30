import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { PickupPassCardComponent } from '../../../../shared/ui/pickup-pass-card/pickup-pass-card';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { resolveOfferImage } from '../../models/offer.model';
import {
  OrderModel,
  OrderPickupPassModel,
  OrderStatusMeta,
  ORDER_STATUS_META,
} from '../../models/order.model';
import { OrderApiService } from '../../services/order-api.service';

interface OrderCardViewModel {
  order: OrderModel;
  statusMeta: OrderStatusMeta;
}

@Component({
  selector: 'app-workspace-reservations-page',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent, PickupPassCardComponent],
  templateUrl: './workspace-reservations.html',
  styleUrl: './workspace-reservations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceReservationsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly orderApi = inject(OrderApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly notificationInbox = inject(NotificationInboxService);

  protected readonly icons = appIcons;
  protected readonly orders = signal<OrderModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly pickupPassLookup = signal<Record<number, OrderPickupPassModel | null>>({});
  protected readonly expandedPickupPassIds = signal<number[]>([]);
  protected readonly loadingPickupPassIds = signal<number[]>([]);
  protected readonly cards = computed<OrderCardViewModel[]>(() =>
    this.orders().map((order) => ({
      order,
      statusMeta: ORDER_STATUS_META[order.status],
    })),
  );
  protected readonly summary = computed(() => ({
    total: this.orders().length,
    active: this.orders().filter((order) => order.status === 'ACTIVE').length,
    completed: this.orders().filter((order) => order.status === 'PICKED_UP').length,
    cancelled: this.orders().filter((order) => order.status === 'CANCELLED').length,
  }));

  constructor() {
    this.loadOrders();
  }

  protected refreshOrders(): void {
    this.loadOrders();
  }

  protected canShowPickupPass(card: OrderCardViewModel): boolean {
    return card.order.status === 'ACTIVE' && card.order.payment !== null;
  }

  protected togglePickupPass(card: OrderCardViewModel): void {
    if (!this.canShowPickupPass(card)) {
      return;
    }

    const orderId = card.order.id;
    if (this.isPickupPassOpen(orderId)) {
      this.expandedPickupPassIds.update((ids) => ids.filter((id) => id !== orderId));
      return;
    }

    this.expandedPickupPassIds.update((ids) => [...ids, orderId]);

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
          this.notificationService.error('Pickup pass could not be loaded right now.');
        },
      });
  }

  protected isPickupPassOpen(reservationId: number): boolean {
    return this.expandedPickupPassIds().includes(reservationId);
  }

  protected isLoadingPickupPass(reservationId: number): boolean {
    return this.loadingPickupPassIds().includes(reservationId);
  }

  protected pickupPass(reservationId: number): OrderPickupPassModel | null {
    return this.pickupPassLookup()[reservationId] ?? null;
  }

  protected paymentSummary(order: OrderModel): string {
    const payment = order.payment;
    if (!payment) {
      return 'Payment record unavailable.';
    }

    return `${payment.amount.toFixed(2)} ${payment.currency} paid with card ending ${payment.cardLast4}.`;
  }

  protected pickupPassButtonLabel(reservationId: number): string {
    if (this.isLoadingPickupPass(reservationId)) {
      return 'Loading pickup QR...';
    }

    return this.isPickupPassOpen(reservationId) ? 'Hide pickup QR' : 'Show pickup QR';
  }

  protected cardEyebrow(order: OrderModel): string {
    return `Order #${order.id}`;
  }

  protected cardStatusLabel(order: OrderModel): string {
    if (order.status === 'ACTIVE') {
      return 'Awaiting pickup';
    }

    return ORDER_STATUS_META[order.status].label;
  }

  protected resolveOfferTitle(card: OrderCardViewModel): string {
    return card.order.item.title;
  }

  protected resolveOfferDescription(card: OrderCardViewModel): string {
    if (card.order.pickupLocation.note?.trim()) {
      return card.order.pickupLocation.note;
    }

    return `Paid order from ${card.order.businessName}.`;
  }

  protected resolveOfferImage(card: OrderCardViewModel): string {
    return resolveOfferImage(card.order.item.imageUrl, card.order.item.offerId);
  }

  protected formatPrice(price: number | null | undefined): string {
    return typeof price === 'number' ? `${price.toFixed(2)} EUR` : 'Price unavailable';
  }

  private loadOrders(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.pickupPassLookup.set({});
    this.expandedPickupPassIds.set([]);
    this.loadingPickupPassIds.set([]);

    this.orderApi
      .getOrders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => {
          const sortedOrders = [...orders].sort(
            (first, second) => this.toTimestamp(second.createdAt) - this.toTimestamp(first.createdAt),
          );

          this.orders.set(sortedOrders);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.orders.set([]);
          this.errorMessage.set('We could not load your pickup history right now. Please try again.');
        },
      });
  }

  private toTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
