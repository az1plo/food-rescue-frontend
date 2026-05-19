import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { BusinessWorkspaceStateService } from '../../../../core/services/business-workspace-state.service';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { BusinessModel } from '../../../../shared/models/business.model';
import { WorkspacePageSkeletonComponent } from '../../../../shared/ui/workspace-page-skeleton/workspace-page-skeleton';
import {
  BusinessOrderCardViewModel,
  BusinessOrdersTab,
  BusinessReservationsFacade,
} from './business-reservations.facade';
import { OrderApiService } from '../../services/order-api.service';

@Component({
  selector: 'app-business-reservations-page',
  imports: [DatePipe, FontAwesomeModule, RouterLink, WorkspacePageSkeletonComponent],
  providers: [BusinessReservationsFacade],
  templateUrl: './business-reservations.html',
  styleUrl: './business-reservations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessReservationsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly reservationsFacade = inject(BusinessReservationsFacade);
  private readonly orderApi = inject(OrderApiService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly notificationService = inject(NotificationService);
  private readonly notificationInbox = inject(NotificationInboxService);

  protected readonly icons = appIcons;
  protected readonly orderTabs: BusinessOrdersTab[] = ['all', 'active', 'completed', 'cancelled'];
  protected readonly business = signal<BusinessModel | null>(null);
  protected readonly cards = this.reservationsFacade.cards;
  protected readonly loading = this.reservationsFacade.loading;
  protected readonly errorMessage = this.reservationsFacade.errorMessage;
  protected readonly confirmingIds = signal<number[]>([]);
  protected readonly pickupTokenDrafts = signal<Record<number, string>>({});
  protected readonly selectedOrderTab = this.reservationsFacade.selectedOrderTab;
  protected readonly summary = this.reservationsFacade.summary;
  protected readonly filteredCards = this.reservationsFacade.filteredCards;
  protected readonly selectOrderTab = this.reservationsFacade.selectOrderTab.bind(this.reservationsFacade);
  protected readonly tabLabel = this.reservationsFacade.tabLabel.bind(this.reservationsFacade);
  protected readonly tabCount = this.reservationsFacade.tabCount.bind(this.reservationsFacade);
  protected readonly emptyTabTitle = this.reservationsFacade.emptyTabTitle.bind(this.reservationsFacade);
  protected readonly emptyTabCopy = this.reservationsFacade.emptyTabCopy.bind(this.reservationsFacade);
  protected readonly paymentSummary = this.reservationsFacade.paymentSummary.bind(this.reservationsFacade);
  protected readonly payoutSummary = this.reservationsFacade.payoutSummary.bind(this.reservationsFacade);
  protected readonly resolveOfferImage = this.reservationsFacade.resolveOfferImage.bind(this.reservationsFacade);
  protected readonly offerItemsSummary = this.reservationsFacade.offerItemsSummary.bind(this.reservationsFacade);
  protected readonly formatPrice = this.reservationsFacade.formatPrice.bind(this.reservationsFacade);
  protected readonly secondaryAddressLine = this.reservationsFacade.secondaryAddressLine.bind(this.reservationsFacade);
  protected readonly cardEyebrow = this.reservationsFacade.cardEyebrow.bind(this.reservationsFacade);
  protected readonly cardStatusLabel = this.reservationsFacade.cardStatusLabel.bind(this.reservationsFacade);
  protected readonly cardTone = this.reservationsFacade.cardTone.bind(this.reservationsFacade);
  protected readonly canVerifyPickup = this.reservationsFacade.canVerifyPickup.bind(this.reservationsFacade);
  protected readonly isExpiredUnconfirmedOrder = this.reservationsFacade.isExpiredUnconfirmedOrder.bind(this.reservationsFacade);
  protected readonly expiredPickupTitle = this.reservationsFacade.expiredPickupTitle.bind(this.reservationsFacade);
  protected readonly expiredPickupSummary = this.reservationsFacade.expiredPickupSummary.bind(this.reservationsFacade);
  protected readonly expiredPickupResolution = this.reservationsFacade.expiredPickupResolution.bind(this.reservationsFacade);

  constructor() {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      const resolvedBusiness = (data['business'] as BusinessModel | null | undefined) ?? null;
      if (!resolvedBusiness) {
        this.business.set(null);
        this.reservationsFacade.setUnavailable('Business orders could not be opened right now.');
        return;
      }

      this.business.set(resolvedBusiness);
      this.businessWorkspaceState.rememberBusinessId(resolvedBusiness.id);
      this.businessWorkspaceState.rememberBusinessSummary(resolvedBusiness);
      this.reloadOrders();
    });
  }

  protected refreshOrders(): void {
    this.reloadOrders();
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
          this.reloadOrders();
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

  private reloadOrders(): void {
    const business = this.business();
    if (!business) {
      return;
    }

    this.pickupTokenDrafts.set({});
    this.reservationsFacade.loadOrders(business.id);
  }
}
