import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { PickupPassCardComponent } from '../../../../shared/ui/pickup-pass-card/pickup-pass-card';
import {
  OrderModel,
  OrderPickupPassModel,
} from '../../models/order.model';
import { OrderApiService } from '../../services/order-api.service';
import {
  WorkspacePickupTab,
  WorkspaceReservationCardViewModel,
  WorkspaceReservationsFacade,
} from './my-pickups.facade';

@Component({
  selector: 'app-workspace-reservations-page',
  imports: [DatePipe, FontAwesomeModule, PickupPassCardComponent],
  providers: [WorkspaceReservationsFacade],
  templateUrl: './my-pickups.html',
  styleUrl: './my-pickups.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceReservationsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly reservationsFacade = inject(WorkspaceReservationsFacade);
  private readonly orderApi = inject(OrderApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly notificationInbox = inject(NotificationInboxService);

  protected readonly icons = appIcons;
  protected readonly pickupTabs: WorkspacePickupTab[] = ['upcoming', 'completed', 'cancelled'];
  protected readonly loadingSkeletonIds = [1, 2, 3] as const;
  protected readonly orders = this.reservationsFacade.orders;
  protected readonly loading = this.reservationsFacade.loading;
  protected readonly errorMessage = this.reservationsFacade.errorMessage;
  protected readonly cards = this.reservationsFacade.cards;
  protected readonly summary = this.reservationsFacade.summary;
  protected readonly filteredCards = this.reservationsFacade.filteredCards;
  protected readonly pastPickupCount = this.reservationsFacade.pastPickupCount;
  protected readonly selectedPickupTab = this.reservationsFacade.selectedPickupTab;
  protected readonly pickupPassLookup = signal<Record<number, OrderPickupPassModel | null>>({});
  protected readonly pickupPassModalOrderId = signal<number | null>(null);
  protected readonly loadingPickupPassIds = signal<number[]>([]);
  protected readonly expandedDetailIds = signal<number[]>([]);
  protected readonly submittingReviewIds = signal<number[]>([]);
  protected readonly reviewScale = [0, 1, 2, 3, 4, 5] as const;
  protected readonly pickupPassModalCard = computed(() => {
    const orderId = this.pickupPassModalOrderId();
    if (orderId === null) {
      return null;
    }

    return this.cards().find((card) => card.order.id === orderId) ?? null;
  });

  protected browseOffers(): void {
    void this.router.navigateByUrl('/browse-offers');
  }

  protected refreshOrders(): void {
    this.resetTransientState();
    this.reservationsFacade.refreshOrders();
  }

  protected readonly selectPickupTab = this.reservationsFacade.selectPickupTab.bind(this.reservationsFacade);
  protected readonly tabLabel = this.reservationsFacade.tabLabel.bind(this.reservationsFacade);
  protected readonly tabCount = this.reservationsFacade.tabCount.bind(this.reservationsFacade);
  protected readonly canShowPickupPass = this.reservationsFacade.canShowPickupPass.bind(this.reservationsFacade);
  protected readonly paymentSummary = this.reservationsFacade.paymentSummary.bind(this.reservationsFacade);
  protected readonly pickupStatusPillLabel = this.reservationsFacade.pickupStatusPillLabel.bind(this.reservationsFacade);
  protected readonly pickupStatusTone = this.reservationsFacade.pickupStatusTone.bind(this.reservationsFacade);
  protected readonly pickupDateLabel = this.reservationsFacade.pickupDateLabel.bind(this.reservationsFacade);
  protected readonly pickupTimeLabel = this.reservationsFacade.pickupTimeLabel.bind(this.reservationsFacade);
  protected readonly pickupAddressPrimary = this.reservationsFacade.pickupAddressPrimary.bind(this.reservationsFacade);
  protected readonly pickupAddressSecondary = this.reservationsFacade.pickupAddressSecondary.bind(this.reservationsFacade);
  protected readonly businessLocationLabel = this.reservationsFacade.businessLocationLabel.bind(this.reservationsFacade);
  protected readonly businessInitials = this.reservationsFacade.businessInitials.bind(this.reservationsFacade);
  protected readonly businessIconUrl = this.reservationsFacade.businessIconUrl.bind(this.reservationsFacade);
  protected readonly isPastDueActiveOrder = this.reservationsFacade.isPastDueActiveOrder.bind(this.reservationsFacade);
  protected readonly resolveOfferTitle = this.reservationsFacade.resolveOfferTitle.bind(this.reservationsFacade);
  protected readonly resolveOfferDescription = this.reservationsFacade.resolveOfferDescription.bind(this.reservationsFacade);
  protected readonly resolveOfferImage = this.reservationsFacade.resolveOfferImage.bind(this.reservationsFacade);
  protected readonly reviewSummary = this.reservationsFacade.reviewSummary.bind(this.reservationsFacade);
  protected readonly formatPrice = this.reservationsFacade.formatPrice.bind(this.reservationsFacade);
  protected readonly formattedOriginalPrice = this.reservationsFacade.formattedOriginalPrice.bind(this.reservationsFacade);
  protected readonly discountPercent = this.reservationsFacade.discountPercent.bind(this.reservationsFacade);
  protected readonly formatPickupPassAmount = this.reservationsFacade.formatPickupPassAmount.bind(this.reservationsFacade);

  protected openPastPickups(): void {
    if (this.summary().completed > 0) {
      this.selectPickupTab('completed');
      return;
    }

    if (this.summary().cancelled > 0) {
      this.selectPickupTab('cancelled');
    }
  }

  protected primaryActionLabel(card: WorkspaceReservationCardViewModel): string {
    if (this.canShowPickupPass(card)) {
      return this.pickupPassButtonLabel(card.order.id);
    }

    return this.isDetailOpen(card.order.id) ? 'Hide details' : 'View details';
  }

  protected togglePrimaryAction(card: WorkspaceReservationCardViewModel): void {
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

  protected togglePickupPass(card: WorkspaceReservationCardViewModel): void {
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

  protected pickupPassButtonLabel(orderId: number): string {
    if (this.isLoadingPickupPass(orderId)) {
      return 'Loading pickup code...';
    }

    return this.isPickupPassOpen(orderId) ? 'Hide pickup code' : 'Show pickup code';
  }

  protected openDirections(card: WorkspaceReservationCardViewModel): void {
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

  protected contactBusiness(_card: WorkspaceReservationCardViewModel): void {
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
          this.reservationsFacade.replaceOrder(updatedOrder);
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
  private resetTransientState(): void {
    this.pickupPassLookup.set({});
    this.pickupPassModalOrderId.set(null);
    this.loadingPickupPassIds.set([]);
    this.expandedDetailIds.set([]);
  }
}
