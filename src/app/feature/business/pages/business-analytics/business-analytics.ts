import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { OFFER_STATUS_META, OfferStatus } from '../../../offer/models/offer.model';
import { BusinessAnalyticsCatalogStatusModel, BusinessAnalyticsDaypartPerformanceModel, BusinessAnalyticsModel } from '../../models/business-analytics.model';
import { BUSINESS_STATUS_META, BusinessModel } from '../../models/business.model';
import { BusinessAnalyticsApiService } from '../../services/business-analytics-api.service';
import { BusinessWorkspaceStateService } from '../../services/business-workspace-state.service';

@Component({
  selector: 'app-business-analytics-page',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './business-analytics.html',
  styleUrl: './business-analytics.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessAnalyticsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly businessAnalyticsApi = inject(BusinessAnalyticsApiService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly notificationService = inject(NotificationService);

  protected readonly icons = appIcons;
  protected readonly business = signal<BusinessModel | null>(null);
  protected readonly analytics = signal<BusinessAnalyticsModel | null>(null);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly businessStatusMeta = computed(() =>
    this.business() ? BUSINESS_STATUS_META[this.business()!.status] : null,
  );
  protected readonly visibleCatalogStatus = computed(() =>
    this.analytics()?.catalogStatus.filter((status) => status.count > 0) ?? [],
  );
  protected readonly activityChartMax = computed(() => {
    const analytics = this.analytics();
    if (!analytics?.dailyActivity.length) {
      return 1;
    }

    return Math.max(
      1,
      ...analytics.dailyActivity.flatMap((point) => [
        point.offersPublished,
        point.reservationsCreated,
        point.cancellations,
        point.pickupsConfirmed,
      ]),
    );
  });
  protected readonly topItemsMax = computed(() => {
    const analytics = this.analytics();
    if (!analytics?.topItems.length) {
      return 1;
    }

    return Math.max(1, ...analytics.topItems.map((item) => item.offeredQuantity));
  });
  protected readonly strongestDaypart = computed(() => {
    const dayparts = this.analytics()?.daypartPerformance ?? [];
    return [...dayparts]
      .filter((slot) => slot.offersScheduled > 0)
      .sort((first, second) => second.pickupRate - first.pickupRate || second.offersScheduled - first.offersScheduled)[0] ?? null;
  });

  constructor() {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      const resolvedBusiness = (data['business'] as BusinessModel | null | undefined) ?? null;

      if (!resolvedBusiness) {
        this.business.set(null);
        this.analytics.set(null);
        this.loading.set(false);
        this.errorMessage.set('Business analytics could not be opened right now.');
        return;
      }

      this.business.set(resolvedBusiness);
      this.businessWorkspaceState.rememberBusinessId(resolvedBusiness.id);
      this.businessWorkspaceState.rememberBusinessSummary(resolvedBusiness);
      this.loadAnalytics();
    });
  }

  protected refreshAnalytics(): void {
    this.loadAnalytics(true);
  }

  protected activityHeight(value: number): number {
    if (value <= 0) {
      return 0;
    }

    const max = this.activityChartMax();
    return Math.max(6, (value / max) * 100);
  }

  protected itemWidth(value: number): number {
    if (value <= 0) {
      return 0;
    }

    const max = this.topItemsMax();
    return Math.max(8, (value / max) * 100);
  }

  protected statusLabel(status: string): string {
    const normalizedStatus = status as OfferStatus;
    return OFFER_STATUS_META[normalizedStatus]?.label ?? this.toTitleCase(status);
  }

  protected statusTone(status: string): string {
    const normalizedStatus = status as OfferStatus;
    return OFFER_STATUS_META[normalizedStatus]?.tone ?? 'default';
  }

  protected formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  protected formatCurrency(value: number): string {
    return `${value.toFixed(2)} EUR`;
  }

  protected formatHours(value: number | null): string {
    if (value === null) {
      return 'Not enough data yet';
    }

    return `${value.toFixed(1)} h`;
  }

  protected daypartTagline(daypart: BusinessAnalyticsDaypartPerformanceModel): string {
    if (!daypart.offersScheduled) {
      return 'No pickup windows in this slot yet.';
    }

    return `${daypart.offersClaimed}/${daypart.offersScheduled} scheduled offers were claimed, and ${daypart.pickupsConfirmed} ended in confirmed pickup.`;
  }

  protected statusSegmentWidth(status: BusinessAnalyticsCatalogStatusModel): number {
    return status.share <= 0 ? 0 : status.share;
  }

  private loadAnalytics(showToast = false): void {
    const business = this.business();
    if (!business) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.businessAnalyticsApi.getBusinessAnalytics(business.id).subscribe({
      next: (analytics) => {
        this.analytics.set(analytics);
        this.loading.set(false);

        if (showToast) {
          this.notificationService.success('Business analytics were refreshed.', 'Analytics updated');
        }
      },
      error: () => {
        this.analytics.set(null);
        this.loading.set(false);
        this.errorMessage.set('We could not load analytics for this business right now. Please try again.');

        if (showToast) {
          this.notificationService.error('Business analytics could not be refreshed.');
        }
      },
    });
  }

  private toTitleCase(value: string): string {
    return value
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
