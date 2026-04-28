import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { catchError, forkJoin, of } from 'rxjs';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { OfferModel, resolveOfferImage } from '../../models/offer.model';
import { ReservationModel, ReservationStatusMeta, RESERVATION_STATUS_META } from '../../models/reservation.model';
import { OfferApiService } from '../../services/offer-api.service';
import { ReservationApiService } from '../../services/reservation-api.service';

interface ReservationCardViewModel {
  reservation: ReservationModel;
  offer: OfferModel | null;
  statusMeta: ReservationStatusMeta;
}

@Component({
  selector: 'app-workspace-reservations-page',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './workspace-reservations.html',
  styleUrl: './workspace-reservations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceReservationsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly reservationApi = inject(ReservationApiService);
  private readonly offerApi = inject(OfferApiService);
  private readonly notificationService = inject(NotificationService);
  private readonly notificationInbox = inject(NotificationInboxService);

  protected readonly icons = appIcons;
  protected readonly reservations = signal<ReservationModel[]>([]);
  protected readonly offerLookup = signal<Record<number, OfferModel | null>>({});
  protected readonly loading = signal(true);
  protected readonly loadingOfferDetails = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly cancellingIds = signal<number[]>([]);
  protected readonly cards = computed<ReservationCardViewModel[]>(() =>
    this.reservations().map((reservation) => ({
      reservation,
      offer: this.offerLookup()[reservation.offerId] ?? null,
      statusMeta: RESERVATION_STATUS_META[reservation.status],
    })),
  );
  protected readonly summary = computed(() => ({
    total: this.reservations().length,
    active: this.reservations().filter((reservation) => reservation.status === 'ACTIVE').length,
    completed: this.reservations().filter((reservation) => reservation.status === 'PICKED_UP').length,
    cancelled: this.reservations().filter((reservation) => reservation.status === 'CANCELLED').length,
  }));

  constructor() {
    this.loadReservations();
  }

  protected refreshReservations(): void {
    this.loadReservations();
  }

  protected cancelReservation(reservation: ReservationModel): void {
    if (!this.canCancelReservation(reservation) || this.isCancelling(reservation.id)) {
      return;
    }

    this.cancellingIds.update((ids) => [...ids, reservation.id]);
    this.reservationApi
      .cancelReservation(reservation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancellingIds.update((ids) => ids.filter((id) => id !== reservation.id));
          this.notificationService.info('Reservation was cancelled successfully.', 'Reservation updated');
          this.notificationInbox.refresh();
          this.loadReservations();
        },
        error: () => {
          this.cancellingIds.update((ids) => ids.filter((id) => id !== reservation.id));
          this.notificationService.error('Reservation could not be cancelled right now.');
        },
      });
  }

  protected canCancelReservation(reservation: ReservationModel): boolean {
    return RESERVATION_STATUS_META[reservation.status].cancelable;
  }

  protected isCancelling(reservationId: number): boolean {
    return this.cancellingIds().includes(reservationId);
  }

  protected resolveOfferTitle(card: ReservationCardViewModel): string {
    return card.offer?.title ?? `Offer #${card.reservation.offerId}`;
  }

  protected resolveOfferDescription(card: ReservationCardViewModel): string {
    if (card.offer?.description?.trim()) {
      return card.offer.description;
    }

    return card.offer
      ? 'Pickup details are attached to this reservation.'
      : 'Offer details are limited right now, but the reservation status is still tracked here.';
  }

  protected resolveOfferImage(card: ReservationCardViewModel): string {
    return resolveOfferImage(card.offer?.imageUrl, card.offer?.id ?? card.reservation.offerId);
  }

  protected formatPrice(price: number | null | undefined): string {
    return typeof price === 'number' ? `${price.toFixed(2)} EUR` : 'Price unavailable';
  }

  private loadReservations(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.offerLookup.set({});
    this.loadingOfferDetails.set(false);

    this.reservationApi
      .getReservations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reservations) => {
          const sortedReservations = [...reservations].sort(
            (first, second) => this.toTimestamp(second.createdAt) - this.toTimestamp(first.createdAt),
          );

          this.reservations.set(sortedReservations);
          this.loading.set(false);
          this.loadOfferDetails(sortedReservations);
        },
        error: () => {
          this.loading.set(false);
          this.reservations.set([]);
          this.errorMessage.set('We could not load your reservations right now. Please try again.');
        },
      });
  }

  private loadOfferDetails(reservations: ReservationModel[]): void {
    const offerIds = [...new Set(reservations.map((reservation) => reservation.offerId))];
    if (!offerIds.length) {
      this.offerLookup.set({});
      return;
    }

    this.loadingOfferDetails.set(true);

    forkJoin(
      offerIds.map((offerId) =>
        this.offerApi.getOffer(offerId).pipe(
          catchError(() => of<OfferModel | null>(null)),
        ),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (offers) => {
          const nextLookup = offerIds.reduce<Record<number, OfferModel | null>>((lookup, offerId, index) => {
            lookup[offerId] = offers[index];
            return lookup;
          }, {});

          this.offerLookup.set(nextLookup);
          this.loadingOfferDetails.set(false);
        },
        error: () => {
          this.offerLookup.set({});
          this.loadingOfferDetails.set(false);
        },
      });
  }

  private toTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
