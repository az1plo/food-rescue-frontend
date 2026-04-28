import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { BusinessAnalyticsModel } from '../../models/business-analytics.model';
import {
  BUSINESS_STATUS_META,
  BusinessStatusMeta,
  BusinessWorkspaceListItem,
} from '../../models/business.model';
import { BusinessAnalyticsApiService } from '../../services/business-analytics-api.service';
import { BusinessWorkspaceStateService } from '../../services/business-workspace-state.service';

interface WorkspaceDashboardSummaryCard {
  label: string;
  value: string;
  detail: string;
}

interface WorkspaceDashboardBusinessCard {
  business: BusinessWorkspaceListItem;
  analytics: BusinessAnalyticsModel | null;
  statusMeta: BusinessStatusMeta;
}

interface WorkspaceDashboardActivityPoint {
  date: string;
  offersPublished: number;
  reservationsCreated: number;
  pickupsConfirmed: number;
  cancellations: number;
}

@Component({
  selector: 'app-workspace-dashboard-page',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './workspace-dashboard.html',
  styleUrl: './workspace-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceDashboardPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly businessAnalyticsApi = inject(BusinessAnalyticsApiService);
  private readonly notificationService = inject(NotificationService);

  protected readonly icons = appIcons;
  protected readonly businesses = signal<BusinessWorkspaceListItem[]>([]);
  protected readonly analyticsLookup = signal<Record<number, BusinessAnalyticsModel | null>>({});
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly analyticsUnavailableCount = computed(
    () => this.businesses().filter((business) => this.analyticsLookup()[business.id] === null).length,
  );
  protected readonly summaryCards = computed<WorkspaceDashboardSummaryCard[]>(() => {
    const businesses = this.businesses();
    const cards = this.businessCards();
    const totalRecoveredRevenue = cards.reduce(
      (sum, card) => sum + (card.analytics?.overview.recoveredRevenue ?? 0),
      0,
    );
    const totalPendingRevenue = cards.reduce(
      (sum, card) => sum + (card.analytics?.overview.pendingReservedRevenue ?? 0),
      0,
    );
    const totalLiveOffers = cards.reduce(
      (sum, card) => sum + (card.analytics?.overview.availableOffers ?? 0),
      0,
    );
    const totalActiveReservations = cards.reduce(
      (sum, card) => sum + (card.analytics?.overview.activeReservations ?? 0),
      0,
    );

    return [
      {
        label: 'Businesses',
        value: businesses.length.toString(),
        detail: `${businesses.filter((business) => business.status === 'ACTIVE').length} active locations right now.`,
      },
      {
        label: 'Live offers',
        value: totalLiveOffers.toString(),
        detail: 'Customer-visible offers across every business workspace.',
      },
      {
        label: 'Open orders',
        value: totalActiveReservations.toString(),
        detail: 'Reservations still waiting for pickup confirmation.',
      },
      {
        label: 'Recovered revenue',
        value: this.formatCurrency(totalRecoveredRevenue),
        detail: `${this.formatCurrency(totalPendingRevenue)} still reserved and pending pickup.`,
      },
    ];
  });
  protected readonly businessCards = computed<WorkspaceDashboardBusinessCard[]>(() =>
    [...this.businesses()]
      .map((business) => ({
        business,
        analytics: this.analyticsLookup()[business.id] ?? null,
        statusMeta: BUSINESS_STATUS_META[business.status],
      }))
      .sort((first, second) => {
        const secondReservations = second.analytics?.overview.activeReservations ?? 0;
        const firstReservations = first.analytics?.overview.activeReservations ?? 0;
        const secondRevenue = second.analytics?.overview.recoveredRevenue ?? 0;
        const firstRevenue = first.analytics?.overview.recoveredRevenue ?? 0;

        return secondReservations - firstReservations || secondRevenue - firstRevenue || second.business.id - first.business.id;
      }),
  );
  protected readonly attentionBusinesses = computed(() =>
    this.businessCards().filter((card) => {
      if (card.business.status !== 'ACTIVE') {
        return true;
      }

      if (!card.analytics) {
        return true;
      }

      return (
        card.analytics.overview.availableOffers === 0 ||
        card.analytics.overview.activeReservations > 0 ||
        card.analytics.overview.cancellationRate >= 30
      );
    }).slice(0, 4),
  );
  protected readonly activity = computed<WorkspaceDashboardActivityPoint[]>(() => {
    const totalsByDate = new Map<string, WorkspaceDashboardActivityPoint>();

    for (const card of this.businessCards()) {
      for (const point of card.analytics?.dailyActivity ?? []) {
        const currentValue = totalsByDate.get(point.date) ?? {
          date: point.date,
          offersPublished: 0,
          reservationsCreated: 0,
          pickupsConfirmed: 0,
          cancellations: 0,
        };

        currentValue.offersPublished += point.offersPublished;
        currentValue.reservationsCreated += point.reservationsCreated;
        currentValue.pickupsConfirmed += point.pickupsConfirmed;
        currentValue.cancellations += point.cancellations;

        totalsByDate.set(point.date, currentValue);
      }
    }

    return [...totalsByDate.values()].sort((first, second) => this.toTimestamp(first.date) - this.toTimestamp(second.date));
  });
  protected readonly activityMax = computed(() => {
    const activity = this.activity();
    if (!activity.length) {
      return 1;
    }

    return Math.max(
      1,
      ...activity.flatMap((point) => [
        point.offersPublished,
        point.reservationsCreated,
        point.pickupsConfirmed,
        point.cancellations,
      ]),
    );
  });
  protected readonly topRevenueMax = computed(() => {
    const revenues = this.businessCards().map((card) => card.analytics?.overview.recoveredRevenue ?? 0);
    return Math.max(1, ...revenues);
  });

  constructor() {
    this.loadDashboard();
  }

  protected refreshDashboard(): void {
    this.loadDashboard(true);
  }

  protected activityHeight(value: number): number {
    if (value <= 0) {
      return 0;
    }

    return Math.max(8, (value / this.activityMax()) * 100);
  }

  protected revenueWidth(value: number): number {
    if (value <= 0) {
      return 0;
    }

    return Math.max(8, (value / this.topRevenueMax()) * 100);
  }

  protected formatCurrency(value: number): string {
    return `${value.toFixed(2)} EUR`;
  }

  protected formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  protected activeReservations(card: WorkspaceDashboardBusinessCard): number {
    return card.analytics?.overview.activeReservations ?? 0;
  }

  protected recoveredRevenue(card: WorkspaceDashboardBusinessCard): number {
    return card.analytics?.overview.recoveredRevenue ?? 0;
  }

  protected availableOffers(card: WorkspaceDashboardBusinessCard): number {
    return card.analytics?.overview.availableOffers ?? 0;
  }

  protected pickupSuccessRate(card: WorkspaceDashboardBusinessCard): number {
    return card.analytics?.overview.pickupSuccessRate ?? 0;
  }

  protected attentionMessage(card: WorkspaceDashboardBusinessCard): string {
    if (card.business.status !== 'ACTIVE') {
      return `${card.statusMeta.label}. Offers and reservations will stay limited until the status is active again.`;
    }

    if (!card.analytics) {
      return 'Analytics did not load for this business, so it deserves a quick manual check.';
    }

    if (card.analytics.overview.activeReservations > 0) {
      return `${card.analytics.overview.activeReservations} pickup reservations are still waiting for completion.`;
    }

    if (card.analytics.overview.availableOffers === 0) {
      return 'There are no live offers for customers right now.';
    }

    return `${this.formatPercent(card.analytics.overview.cancellationRate)} of reservations were cancelled. It may be worth reviewing pickup timing.`;
  }

  protected businessAddress(card: WorkspaceDashboardBusinessCard): string {
    return `${card.business.address.street}, ${card.business.address.city}, ${card.business.address.country}`;
  }

  private loadDashboard(showToast = false): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.businessWorkspaceState
      .refreshBusinesses()
      .pipe(
        switchMap((businesses) => {
          this.businesses.set(businesses);

          if (!businesses.length) {
            return of([] as (BusinessAnalyticsModel | null)[]);
          }

          return forkJoin(
            businesses.map((business) =>
              this.businessAnalyticsApi.getBusinessAnalytics(business.id).pipe(catchError(() => of<BusinessAnalyticsModel | null>(null))),
            ),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (analytics) => {
          const nextLookup = this.businesses().reduce<Record<number, BusinessAnalyticsModel | null>>((lookup, business, index) => {
            lookup[business.id] = analytics[index] ?? null;
            return lookup;
          }, {});

          this.analyticsLookup.set(nextLookup);
          this.loading.set(false);

          if (showToast) {
            this.notificationService.success('Workspace dashboard was refreshed.', 'Dashboard updated');
          }
        },
        error: () => {
          this.loading.set(false);
          this.businesses.set([]);
          this.analyticsLookup.set({});
          this.errorMessage.set('We could not load your business dashboard right now. Please try again.');

          if (showToast) {
            this.notificationService.error('Workspace dashboard could not be refreshed.');
          }
        },
      });
  }

  private toTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }
}
