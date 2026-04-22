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
import {
  BUSINESS_STATUS_META,
  BusinessModel,
  BusinessPayload,
  BusinessStatusMeta,
} from '../../models/business.model';
import { BusinessApiService } from '../../services/business-api.service';
import { BusinessWorkspaceStateService } from '../../services/business-workspace-state.service';

type BusinessDetailsMode = 'view' | 'create' | 'edit';

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
  private readonly businessApi = inject(BusinessApiService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);

  protected readonly user = this.userService.getUser();
  protected readonly currentBusiness = signal<BusinessModel | null>(null);
  protected readonly mode = signal<BusinessDetailsMode>('view');
  protected readonly detailLoading = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
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
  protected readonly selectedStatusMeta = computed(() =>
    this.currentBusiness() ? BUSINESS_STATUS_META[this.currentBusiness()!.status] : null,
  );
  protected readonly canDeleteBusiness = computed(
    () => this.user()?.role !== UserRoleEnum.ADMIN && !!this.currentBusiness() && !this.isCreateMode(),
  );
  protected readonly showUnavailableState = computed(
    () => !this.detailLoading() && !this.isCreateMode() && !this.currentBusiness(),
  );

  protected readonly pageTitle = computed(() => {
    if (this.isCreateMode()) {
      return 'Create business';
    }

    if (this.isEditMode()) {
      return 'Edit business';
    }

    return this.currentBusiness()?.name ?? 'Business details';
  });
  protected readonly pageDescription = computed(() => {
    if (this.isCreateMode()) {
      return 'Start with the core venue information. You can keep refining the business profile later inside the workspace.';
    }

    if (this.isEditMode()) {
      return 'Update the venue information and save when the business profile is ready.';
    }

    return 'Review status, business information, and workspace details for the selected location.';
  });
  protected readonly sideSummaryTitle = computed(() =>
    this.isCreateMode() ? 'New business profile' : this.currentBusiness()?.name ?? 'Business workspace',
  );
  protected readonly sideSummaryDescription = computed(() =>
    this.isCreateMode()
      ? 'New profiles stay separate from the list until you save them.'
      : this.isEditMode()
        ? 'Return to the saved business details whenever you want before applying changes.'
        : this.selectedStatusMeta()?.description ?? 'Business details are unavailable right now.',
  );

  constructor() {
    combineLatest([this.route.paramMap, this.route.data])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([params, data]) => {
      const rawId = params.get('id');
      const isCreateRoute = data['mode'] === 'create';

      if (isCreateRoute) {
        this.enterCreateMode();
        return;
      }

      const businessId = Number(rawId);
      if (!Number.isInteger(businessId) || businessId <= 0) {
        this.mode.set('view');
        this.currentBusiness.set(null);
        this.detailLoading.set(false);
        this.errorMessage.set('Business details could not be opened.');
        return;
      }

      this.mode.set('view');
      this.submitAttempted.set(false);
      this.detailLoading.set(false);

      const resolvedBusiness = (data['business'] as BusinessModel | null | undefined) ?? null;
      if (!resolvedBusiness) {
        this.currentBusiness.set(null);
        this.errorMessage.set('Business details could not be loaded.');
        return;
      }

      this.errorMessage.set(null);
      this.currentBusiness.set(resolvedBusiness);
      this.patchForm(resolvedBusiness);
    });
  }

  protected startEditBusiness(): void {
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
        this.mode.set('view');
        this.currentBusiness.set(updatedBusiness);
        this.patchForm(updatedBusiness);
        this.businessWorkspaceState.rememberBusinessId(updatedBusiness.id);
        this.businessWorkspaceState.rememberBusinessSummary(updatedBusiness);
        this.notificationService.success('Business details were updated.', 'Business saved');
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

  private enterCreateMode(): void {
    this.mode.set('create');
    this.currentBusiness.set(null);
    this.detailLoading.set(false);
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
        this.mode.set('view');
        this.patchForm(business);
        this.businessWorkspaceState.rememberBusinessId(business.id);
        this.businessWorkspaceState.rememberBusinessSummary(business);
      },
      error: () => {
        this.detailLoading.set(false);
        this.currentBusiness.set(null);
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
}
