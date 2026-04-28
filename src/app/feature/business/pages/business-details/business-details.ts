import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { combineLatest, switchMap } from 'rxjs';
import { UserRoleEnum } from '../../../../core/models/user-role-enum';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { BusinessAnalyticsModel } from '../../models/business-analytics.model';
import {
  BUSINESS_STATUS_META,
  BusinessModel,
  BusinessPayload,
  BusinessStatusMeta,
} from '../../models/business.model';
import { BusinessAnalyticsApiService } from '../../services/business-analytics-api.service';
import { BusinessApiService } from '../../services/business-api.service';
import { BusinessWorkspaceStateService } from '../../services/business-workspace-state.service';

type BusinessDetailsMode = 'view' | 'create' | 'edit';
type BusinessRouteMode = 'details' | 'create' | 'settings';

interface BusinessDashboardStat {
  label: string;
  value: string;
  detail: string;
}

@Component({
  selector: 'app-business-details-page',
  imports: [DatePipe, RouterLink, ReactiveFormsModule, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './business-details.html',
  styleUrl: './business-details.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessDetailsPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly businessAnalyticsApi = inject(BusinessAnalyticsApiService);
  private readonly businessApi = inject(BusinessApiService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);

  protected readonly user = this.userService.getUser();
  protected readonly currentBusiness = signal<BusinessModel | null>(null);
  protected readonly mode = signal<BusinessDetailsMode>('view');
  protected readonly routeMode = signal<BusinessRouteMode>('details');
  protected readonly detailLoading = signal(false);
  protected readonly dashboardLoading = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly dashboardError = signal<string | null>(null);
  protected readonly dashboardAnalytics = signal<BusinessAnalyticsModel | null>(null);
  protected readonly icons = appIcons;
  protected readonly countries = ['Slovakia', 'Czechia', 'Austria', 'Hungary', 'Poland'];

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.maxLength(500)]],
    street: ['', [Validators.required, Validators.maxLength(160)]],
    city: ['', [Validators.required, Validators.maxLength(120)]],
    postalCode: ['', [Validators.required, Validators.maxLength(32)]],
    country: ['Slovakia', [Validators.required, Validators.maxLength(120)]],
  });

  protected readonly isCreateMode = computed(() => this.mode() === 'create');
  protected readonly isEditMode = computed(() => this.mode() === 'edit');
  protected readonly isEditorMode = computed(() => this.isCreateMode() || this.isEditMode());
  protected readonly isSettingsPage = computed(() => this.routeMode() === 'settings');
  protected readonly selectedStatusMeta = computed(() =>
    this.currentBusiness() ? BUSINESS_STATUS_META[this.currentBusiness()!.status] : null,
  );
  protected readonly canEditBusiness = computed(
    () => this.user()?.role !== UserRoleEnum.ADMIN && !!this.currentBusiness() && !this.isCreateMode(),
  );
  protected readonly canDeleteBusiness = computed(
    () => this.user()?.role !== UserRoleEnum.ADMIN && !!this.currentBusiness() && !this.isCreateMode(),
  );
  protected readonly canViewOffers = computed(() => !!this.currentBusiness() && !this.isCreateMode());
  protected readonly canViewReservations = computed(() => !!this.currentBusiness() && !this.isCreateMode());
  protected readonly canViewAnalytics = computed(() => !!this.currentBusiness() && !this.isCreateMode());
  protected readonly canManageSettings = computed(
    () => this.user()?.role !== UserRoleEnum.ADMIN && !!this.currentBusiness() && !this.isCreateMode(),
  );
  protected readonly showUnavailableState = computed(
    () => !this.detailLoading() && !this.isCreateMode() && !this.currentBusiness(),
  );
  protected readonly dashboardStats = computed<BusinessDashboardStat[]>(() => {
    const analytics = this.dashboardAnalytics();
    if (!analytics) {
      return [];
    }

    return [
      {
        label: 'Live offers',
        value: analytics.overview.availableOffers.toString(),
        detail: 'Currently visible to customers.',
      },
      {
        label: 'Order queue',
        value: analytics.overview.activeReservations.toString(),
        detail: 'Reservations still waiting for pickup.',
      },
      {
        label: 'Recovered revenue',
        value: this.formatCurrency(analytics.overview.recoveredRevenue),
        detail: 'Value already confirmed through pickups.',
      },
      {
        label: 'Pickup success',
        value: this.formatPercent(analytics.overview.pickupSuccessRate),
        detail: 'Share of reservations that reached pickup.',
      },
    ];
  });
  protected readonly dashboardInsights = computed(() => this.dashboardAnalytics()?.insights.slice(0, 3) ?? []);

  protected readonly pageTitle = computed(() => {
    if (this.isCreateMode()) {
      return 'Create business';
    }

    if (this.isEditMode()) {
      return this.isSettingsPage() ? 'Business settings' : 'Edit business';
    }

    return this.currentBusiness()?.name ?? 'Business dashboard';
  });
  protected readonly pageDescription = computed(() => {
    if (this.isCreateMode()) {
      return 'Start with the core venue information. You can keep refining the business profile later inside the workspace.';
    }

    if (this.isEditMode()) {
      return this.isSettingsPage()
        ? 'Update the business profile, pickup location defaults, and core venue details from one settings page.'
        : 'Update the venue information and save when the business profile is ready.';
    }

    return 'Review the health of this location, jump into the order queue, and keep the business workspace focused on one venue.';
  });
  protected readonly sideSummaryTitle = computed(() =>
    this.isCreateMode()
      ? 'New business profile'
      : this.isSettingsPage()
        ? 'Business settings'
        : this.currentBusiness()?.name ?? 'Business workspace',
  );
  protected readonly sideSummaryDescription = computed(() =>
    this.isCreateMode()
      ? 'New profiles stay separate from the list until you save them.'
      : this.isEditMode()
        ? this.isSettingsPage()
          ? 'Save changes here to update the selected business everywhere in the workspace.'
          : 'Return to the saved business details whenever you want before applying changes.'
        : this.selectedStatusMeta()?.description ?? 'Business details are unavailable right now.',
  );

  constructor() {
    combineLatest([this.route.paramMap, this.route.data])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([params, data]) => {
        const rawId = params.get('id');
        const resolvedRouteMode = this.resolveRouteMode(data['mode']);
        this.routeMode.set(resolvedRouteMode);

        if (resolvedRouteMode === 'create') {
          this.enterCreateMode();
          return;
        }

        const businessId = Number(rawId);
        if (!Number.isInteger(businessId) || businessId <= 0) {
          this.mode.set('view');
          this.currentBusiness.set(null);
          this.detailLoading.set(false);
          this.dashboardLoading.set(false);
          this.dashboardAnalytics.set(null);
          this.errorMessage.set('Business details could not be opened.');
          return;
        }

        this.mode.set(resolvedRouteMode === 'settings' ? 'edit' : 'view');
        this.submitAttempted.set(false);
        this.detailLoading.set(false);

        const resolvedBusiness = (data['business'] as BusinessModel | null | undefined) ?? null;
        if (!resolvedBusiness) {
          this.currentBusiness.set(null);
          this.dashboardAnalytics.set(null);
          this.dashboardLoading.set(false);
          this.errorMessage.set('Business details could not be loaded.');
          return;
        }

        this.errorMessage.set(null);
        this.currentBusiness.set(resolvedBusiness);
        this.patchForm(resolvedBusiness);

        if (resolvedRouteMode === 'settings') {
          this.dashboardAnalytics.set(null);
          this.dashboardLoading.set(false);
          this.dashboardError.set(null);
          return;
        }

        this.loadDashboardAnalytics(resolvedBusiness.id);
      });
  }

  protected startEditBusiness(): void {
    if (!this.canEditBusiness()) {
      return;
    }

    const business = this.currentBusiness();
    if (!business) {
      return;
    }

    this.mode.set('edit');
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
    this.patchForm(business);
  }

  protected cancelEdit(): void {
    if (this.isCreateMode()) {
      void this.router.navigateByUrl('/workspace/my-businesses');
      return;
    }

    if (this.isSettingsPage()) {
      const business = this.currentBusiness();
      if (business) {
        void this.router.navigate(['/workspace', 'my-businesses', business.id]);
      }
      return;
    }

    this.mode.set('view');
    this.submitAttempted.set(false);
    this.errorMessage.set(null);

    const business = this.currentBusiness();
    if (business) {
      this.patchForm(business);
    }
  }

  protected saveBusiness(): void {
    this.submitAttempted.set(true);
    this.errorMessage.set(null);

    if (this.form.invalid) {
      return;
    }

    const payload = this.buildPayload();
    if (this.isCreateMode()) {
      this.createBusiness(payload);
      return;
    }

    const business = this.currentBusiness();
    if (!business) {
      return;
    }

    this.detailLoading.set(true);
    this.businessApi.updateBusiness(business.id, payload).subscribe({
      next: (updatedBusiness) => {
        this.detailLoading.set(false);
        this.mode.set(this.isSettingsPage() ? 'edit' : 'view');
        this.currentBusiness.set(updatedBusiness);
        this.patchForm(updatedBusiness);
        this.businessWorkspaceState.rememberBusinessId(updatedBusiness.id);
        this.businessWorkspaceState.rememberBusinessSummary(updatedBusiness);
        this.notificationService.success('Business details were updated.', 'Business saved');

        if (!this.isSettingsPage()) {
          this.loadDashboardAnalytics(updatedBusiness.id);
        }
      },
      error: () => {
        this.detailLoading.set(false);
        this.errorMessage.set('We could not save the changes right now. Please try again.');
        this.notificationService.error('Business changes could not be saved.');
      },
    });
  }

  protected refreshBusiness(): void {
    const business = this.currentBusiness();
    if (!business || this.isCreateMode()) {
      return;
    }

    this.loadBusiness(business.id, true);
  }

  protected deleteBusiness(): void {
    const business = this.currentBusiness();
    if (!business || !this.canDeleteBusiness()) {
      return;
    }

    const confirmed = confirm(`Delete "${business.name}"?`);
    if (!confirmed) {
      return;
    }

    this.detailLoading.set(true);
    this.businessApi
      .deleteBusiness(business.id)
      .pipe(switchMap(() => this.businessWorkspaceState.refreshBusinesses()))
      .subscribe({
        next: () => {
          this.detailLoading.set(false);
          this.notificationService.info('Business was deleted.', 'Business removed');
          this.currentBusiness.set(null);
          this.mode.set('view');
          void this.router.navigateByUrl('/workspace/my-businesses');
        },
        error: () => {
          this.detailLoading.set(false);
          this.notificationService.error('Business could not be deleted.');
        },
      });
  }

  protected showFieldError(fieldName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[fieldName];
    return this.submitAttempted() && control.invalid;
  }

  protected formatBusinessId(id: number): string {
    return id.toString().padStart(5, '0');
  }

  protected statusTone(): BusinessStatusMeta['tone'] | null {
    return this.selectedStatusMeta()?.tone ?? null;
  }

  protected formatCurrency(value: number): string {
    return `${value.toFixed(2)} EUR`;
  }

  protected formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
  }

  private enterCreateMode(): void {
    this.mode.set('create');
    this.currentBusiness.set(null);
    this.detailLoading.set(false);
    this.dashboardLoading.set(false);
    this.dashboardAnalytics.set(null);
    this.dashboardError.set(null);
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
    this.form.reset({
      name: '',
      description: '',
      street: '',
      city: '',
      postalCode: '',
      country: 'Slovakia',
    });
  }

  private loadBusiness(id: number, preserveCurrent: boolean): void {
    this.detailLoading.set(true);
    this.errorMessage.set(null);

    if (!preserveCurrent) {
      this.currentBusiness.set(null);
    }

    this.businessApi.getBusiness(id).subscribe({
      next: (business) => {
        this.detailLoading.set(false);
        this.currentBusiness.set(business);
        this.mode.set(this.isSettingsPage() ? 'edit' : 'view');
        this.patchForm(business);
        this.businessWorkspaceState.rememberBusinessId(business.id);
        this.businessWorkspaceState.rememberBusinessSummary(business);

        if (this.isSettingsPage()) {
          this.dashboardAnalytics.set(null);
          this.dashboardLoading.set(false);
          this.dashboardError.set(null);
          return;
        }

        this.loadDashboardAnalytics(business.id);
      },
      error: () => {
        this.detailLoading.set(false);
        this.currentBusiness.set(null);
        this.dashboardLoading.set(false);
        this.dashboardAnalytics.set(null);
        this.errorMessage.set('Business details could not be loaded.');
      },
    });
  }

  private createBusiness(payload: BusinessPayload): void {
    const existingIds = new Set(this.businessWorkspaceState.knownBusinesses().map((item) => item.id));
    this.detailLoading.set(true);

    this.businessApi
      .createBusiness(payload)
      .pipe(switchMap(() => this.businessWorkspaceState.refreshBusinesses()))
      .subscribe({
        next: (items) => {
          this.detailLoading.set(false);
          const nextBusiness =
            items.find((item) => !existingIds.has(item.id)) ??
            [...items].sort((first, second) => second.id - first.id)[0] ??
            null;

          this.notificationService.success('Business was created successfully.', 'Business saved');

          if (!nextBusiness) {
            void this.router.navigateByUrl('/workspace/my-businesses');
            return;
          }

          this.businessWorkspaceState.rememberBusinessId(nextBusiness.id);
          void this.router.navigate(['/workspace', 'my-businesses', nextBusiness.id]);
        },
        error: () => {
          this.detailLoading.set(false);
          this.errorMessage.set('We could not create the business right now. Please try again.');
          this.notificationService.error('Business could not be created.');
        },
      });
  }

  private buildPayload(): BusinessPayload {
    const rawValue = this.form.getRawValue();

    return {
      name: rawValue.name.trim(),
      description: rawValue.description.trim() || null,
      address: {
        street: rawValue.street.trim(),
        city: rawValue.city.trim(),
        postalCode: rawValue.postalCode.trim(),
        country: rawValue.country.trim(),
      },
    };
  }

  private patchForm(business: BusinessModel): void {
    this.form.reset({
      name: business.name,
      description: business.description ?? '',
      street: business.address.street,
      city: business.address.city,
      postalCode: business.address.postalCode,
      country: business.address.country,
    });
  }

  private loadDashboardAnalytics(businessId: number): void {
    this.dashboardLoading.set(true);
    this.dashboardError.set(null);
    this.dashboardAnalytics.set(null);

    this.businessAnalyticsApi.getBusinessAnalytics(businessId).subscribe({
      next: (analytics) => {
        this.dashboardAnalytics.set(analytics);
        this.dashboardLoading.set(false);
      },
      error: () => {
        this.dashboardAnalytics.set(null);
        this.dashboardLoading.set(false);
        this.dashboardError.set('Dashboard metrics are unavailable right now. You can still manage the business and refresh again in a moment.');
      },
    });
  }

  private resolveRouteMode(value: unknown): BusinessRouteMode {
    if (value === 'create' || value === 'settings') {
      return value;
    }

    return 'details';
  }
}
