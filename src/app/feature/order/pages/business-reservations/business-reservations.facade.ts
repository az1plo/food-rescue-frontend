import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OrderModel } from '../../models/order.model';
import {
  buildBusinessOrderEyebrow,
  buildBusinessOrderStatusLabel,
  buildBusinessExpiredPickupResolution,
  buildBusinessExpiredPickupSummary,
  buildBusinessExpiredPickupTitle,
  formatBusinessOrderItemsSummary,
  formatBusinessOrderPaymentSummary,
  formatBusinessOrderPayoutSummary,
  formatBusinessOrderPrice,
  formatBusinessOrderSecondaryAddressLine,
  getBusinessOrdersEmptyStateCopy,
  getBusinessOrdersEmptyStateTitle,
  getBusinessOrdersTabCount,
  getBusinessOrdersTabLabel,
  resolveBusinessOrderImage,
  resolveBusinessOrderTone,
} from './business-reservations-copy.utils';
import {
  BusinessOrderCardViewModel,
  BusinessOrdersSummary,
  BusinessOrdersTab,
} from './business-reservations.models';
import {
  buildBusinessOrderCards,
  buildBusinessOrdersSummary,
  canVerifyBusinessPickup,
  filterBusinessOrderCards,
  isExpiredUnconfirmedBusinessOrder,
} from './business-reservations-state.utils';
import { OrderApiService } from '../../services/order-api.service';

export type { BusinessOrderCardViewModel, BusinessOrdersTab } from './business-reservations.models';

@Injectable()
export class BusinessReservationsFacade {
  private readonly destroyRef = inject(DestroyRef);
  private readonly orderApi = inject(OrderApiService);
  private readonly currentTimestamp = signal(Date.now());

  readonly cards = signal<BusinessOrderCardViewModel[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedOrderTab = signal<BusinessOrdersTab>('all');
  readonly summary = computed<BusinessOrdersSummary>(() =>
    buildBusinessOrdersSummary(this.cards(), this.currentTimestamp()),
  );
  readonly filteredCards = computed(() => {
    return filterBusinessOrderCards(this.cards(), this.selectedOrderTab(), this.currentTimestamp());
  });

  constructor() {
    const timeTicker = window.setInterval(() => {
      this.currentTimestamp.set(Date.now());
    }, 60_000);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(timeTicker);
    });
  }

  loadOrders(businessId: number): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.orderApi
      .getOrders(businessId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (orders) => {
          this.cards.set(buildBusinessOrderCards(orders));
          this.loading.set(false);
        },
        error: () => {
          this.cards.set([]);
          this.loading.set(false);
          this.errorMessage.set('We could not load orders for this business right now. Please try again.');
        },
      });
  }

  setUnavailable(message: string): void {
    this.cards.set([]);
    this.loading.set(false);
    this.errorMessage.set(message);
  }

  selectOrderTab(tab: BusinessOrdersTab): void {
    this.selectedOrderTab.set(tab);
  }

  tabLabel(tab: BusinessOrdersTab): string {
    return getBusinessOrdersTabLabel(tab);
  }

  tabCount(tab: BusinessOrdersTab): number {
    return getBusinessOrdersTabCount(this.summary(), tab);
  }

  emptyTabTitle(): string {
    return getBusinessOrdersEmptyStateTitle(this.selectedOrderTab());
  }

  emptyTabCopy(): string {
    return getBusinessOrdersEmptyStateCopy(this.selectedOrderTab());
  }

  paymentSummary(card: BusinessOrderCardViewModel): string {
    return formatBusinessOrderPaymentSummary(card);
  }

  payoutSummary(card: BusinessOrderCardViewModel): string {
    return formatBusinessOrderPayoutSummary(card, this.isExpiredUnconfirmedOrder(card.order));
  }

  resolveOfferImage(card: BusinessOrderCardViewModel): string {
    return resolveBusinessOrderImage(card);
  }

  offerItemsSummary(card: BusinessOrderCardViewModel): string {
    return formatBusinessOrderItemsSummary(card);
  }

  formatPrice(value: number): string {
    return formatBusinessOrderPrice(value);
  }

  secondaryAddressLine(card: BusinessOrderCardViewModel): string {
    return formatBusinessOrderSecondaryAddressLine(card);
  }

  cardEyebrow(card: BusinessOrderCardViewModel): string {
    return buildBusinessOrderEyebrow(card);
  }

  cardStatusLabel(card: BusinessOrderCardViewModel): string {
    return buildBusinessOrderStatusLabel(card, this.isExpiredUnconfirmedOrder(card.order));
  }

  cardTone(card: BusinessOrderCardViewModel): BusinessOrderCardViewModel['statusMeta']['tone'] {
    return resolveBusinessOrderTone(card, this.isExpiredUnconfirmedOrder(card.order));
  }

  canVerifyPickup(card: BusinessOrderCardViewModel): boolean {
    return canVerifyBusinessPickup(card, this.currentTimestamp());
  }

  isExpiredUnconfirmedOrder(order: OrderModel): boolean {
    return isExpiredUnconfirmedBusinessOrder(order, this.currentTimestamp());
  }

  expiredPickupTitle(card: BusinessOrderCardViewModel): string {
    return buildBusinessExpiredPickupTitle(card);
  }

  expiredPickupSummary(card: BusinessOrderCardViewModel): string {
    return buildBusinessExpiredPickupSummary(card);
  }

  expiredPickupResolution(card: BusinessOrderCardViewModel): string {
    return buildBusinessExpiredPickupResolution(card);
  }
}
