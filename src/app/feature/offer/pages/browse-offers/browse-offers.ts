import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { OfferModel, resolveOfferImage } from '../../models/offer.model';
import { OfferApiService } from '../../services/offer-api.service';
import { ReservationApiService } from '../../services/reservation-api.service';

@Component({
  selector: 'app-browse-offers-page',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './browse-offers.html',
  styleUrl: './browse-offers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowseOffersPage {
  private readonly offerApi = inject(OfferApiService);
  private readonly reservationApi = inject(ReservationApiService);
  private readonly notificationInbox = inject(NotificationInboxService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);

  protected readonly user = this.userService.getUser();
  protected readonly icons = appIcons;
  protected readonly offers = signal<OfferModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly reservingIds = signal<number[]>([]);
  protected readonly liveOfferCount = computed(() => this.offers().length);

  constructor() {
    this.loadOffers();
  }

  protected refreshOffers(): void {
    this.loadOffers();
  }

  protected reserveOffer(offer: OfferModel): void {
    if (this.isReserving(offer.id)) {
      return;
    }

    if (!this.user()) {
      void this.userService.login('/browse-offers');
      return;
    }

    this.reservingIds.update((ids) => [...ids, offer.id]);
    this.reservationApi.createReservation({ offerId: offer.id }).subscribe({
      next: () => {
        this.notificationService.success(`"${offer.title}" was reserved successfully.`, 'Reservation confirmed');
        this.notificationInbox.refresh();
        this.removeReservingId(offer.id);
        this.loadOffers();
      },
      error: (error: { status?: number } | undefined) => {
        this.removeReservingId(offer.id);

        if (error?.status === 401) {
          void this.userService.login('/browse-offers');
          return;
        }

        this.notificationService.error('This offer could not be reserved right now. Please refresh and try again.');
      },
    });
  }

  protected loginToReserve(): void {
    void this.userService.login('/browse-offers');
  }

  protected isReserving(offerId: number): boolean {
    return this.reservingIds().includes(offerId);
  }

  protected resolveOfferImage(offer: OfferModel): string {
    return resolveOfferImage(offer.imageUrl, offer.id);
  }

  protected formatPrice(price: number): string {
    return `${price.toFixed(2)} EUR`;
  }

  protected offerItemsSummary(offer: OfferModel): string {
    return offer.items.map((item) => `${item.quantity}x ${item.name}`).join(', ');
  }

  private loadOffers(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.offerApi.getOffers().subscribe({
      next: (offers) => {
        this.offers.set(offers);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('We could not load rescue offers right now. Please try again soon.');
      },
    });
  }

  private removeReservingId(offerId: number): void {
    this.reservingIds.update((ids) => ids.filter((currentId) => currentId !== offerId));
  }
}
