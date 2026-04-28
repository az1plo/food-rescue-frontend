import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { BusinessModel } from '../../../business/models/business.model';
import { BusinessWorkspaceStateService } from '../../../business/services/business-workspace-state.service';
import { OfferModel, resolveOfferImage } from '../../models/offer.model';
import {
  ReservationModel,
  ReservationStatusMeta,
  RESERVATION_STATUS_META,
} from '../../models/reservation.model';
import { OfferApiService } from '../../services/offer-api.service';
import { ReservationApiService } from '../../services/reservation-api.service';

interface BusinessReservationCardViewModel {
  reservation: ReservationModel;
  offer: OfferModel;
  statusMeta: ReservationStatusMeta;
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
  private readonly offerApi = inject(OfferApiService);
  private readonly reservationApi = inject(ReservationApiService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly notificationService = inject(NotificationService);
  private readonly notificationInbox = inject(NotificationInboxService);

  protected readonly icons = appIcons;
  protected readonly business = signal<BusinessModel | null>(null);
  protected readonly cards = signal<BusinessReservationCardViewModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly confirmingIds = signal<number[]>([]);
  protected readonly summary = computed(() => ({
    total: this.cards().length,
    active: this.cards().filter((card) => card.reservation.status === 'ACTIVE').length,
    completed: this.cards().filter((card) => card.reservation.status === 'PICKED_UP').length,
    cancelled: this.cards().filter((card) => card.reservation.status === 'CANCELLED').length,
  }));

  constructor() {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      const resolvedBusiness = (data['business'] as BusinessModel | null | undefined) ?? null;
      if (!resolvedBusiness) {
        this.business.set(null);
        this.cards.set([]);
        this.loading.set(false);
        this.errorMessage.set('Business reservations could not be opened right now.');
        return;
      }

      this.business.set(resolvedBusiness);
      this.businessWorkspaceState.rememberBusinessId(resolvedBusiness.id);
      this.businessWorkspaceState.rememberBusinessSummary(resolvedBusiness);
      this.loadReservations();
    });
  }

  protected refreshReservations(): void {
    this.loadReservations();
  }

  protected confirmPickup(card: BusinessReservationCardViewModel): void {
    if (card.reservation.status !== 'ACTIVE' || this.isConfirming(card.reservation.id)) {
      return;
    }

    this.confirmingIds.update((ids) => [...ids, card.reservation.id]);
    this.reservationApi
      .confirmPickup(card.reservation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.confirmingIds.update((ids) => ids.filter((id) => id !== card.reservation.id));
          this.notificationService.success('Pickup was confirmed for this reservation.', 'Reservation updated');
          this.notificationInbox.refresh();
          this.loadReservations();
        },
        error: () => {
          this.confirmingIds.update((ids) => ids.filter((id) => id !== card.reservation.id));
          this.notificationService.error('Pickup confirmation could not be completed.');
        },
      });
  }

  protected isConfirming(id: number): boolean {
    return this.confirmingIds().includes(id);
  }

  protected resolveOfferImage(card: BusinessReservationCardViewModel): string {
    return resolveOfferImage(card.offer.imageUrl, card.offer.id);
  }

  protected offerItemsSummary(card: BusinessReservationCardViewModel): string {
    return card.offer.items.map((item) => `${item.quantity}x ${item.name}`).join(', ');
  }

  protected formatPrice(value: number): string {
    return `${value.toFixed(2)} EUR`;
  }

  private loadReservations(): void {
    const business = this.business();
    if (!business) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.offerApi
      .getOffers(business.id)
      .pipe(
        switchMap((offers) => {
          if (!offers.length) {
            return of([] as BusinessReservationCardViewModel[]);
          }

          return forkJoin(
            offers.map((offer) =>
              this.reservationApi.getReservations(offer.id).pipe(
                catchError(() => of<ReservationModel[]>([])),
              ),
            ),
          ).pipe(
            switchMap((reservationGroups) => {
              const cards = offers.flatMap((offer, index) =>
                reservationGroups[index].map((reservation) => ({
                  reservation,
                  offer,
                  statusMeta: RESERVATION_STATUS_META[reservation.status],
                })),
              );

              return of(cards);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (cards) => {
          const sortedCards = [...cards].sort(
            (first, second) => this.toTimestamp(second.reservation.createdAt) - this.toTimestamp(first.reservation.createdAt),
          );

          this.cards.set(sortedCards);
          this.loading.set(false);
        },
        error: () => {
          this.cards.set([]);
          this.loading.set(false);
          this.errorMessage.set('We could not load reservations for this business right now. Please try again.');
        },
      });
  }

  private toTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
