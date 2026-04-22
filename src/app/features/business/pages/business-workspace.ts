import { DatePipe, Location, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { switchMap } from 'rxjs';
import { UserRoleEnum } from '../../../core/models/user-role-enum';
import { NotificationService } from '../../../core/services/notification.service';
import { UserService } from '../../../core/services/user.service';
import { appIcons } from '../../../shared/icons/app-icons';
import {
  BUSINESS_STATUS_META,
  BusinessModel,
  BusinessPayload,
  BusinessStatus,
  BusinessStatusMeta,
  BusinessWorkspaceListItem,
} from '../models/business.model';
import { BusinessApiService } from '../services/business-api.service';
import { BusinessWorkspaceStateService } from '../services/business-workspace-state.service';
import { ActionButtonComponent } from '../../../shared/ui/action-button/action-button';
import { CircleIconComponent } from '../../../shared/ui/circle-icon/circle-icon';

type WorkspaceMode = 'view' | 'create' | 'edit';

@Component({
  selector: 'app-business-workspace-page',
  imports: [DatePipe, NgTemplateOutlet, ReactiveFormsModule, FontAwesomeModule, ActionButtonComponent, CircleIconComponent],
  templateUrl: './business-workspace.html',
  styleUrl: './business-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessWorkspacePage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly fb = inject(FormBuilder);
  private readonly businessApi = inject(BusinessApiService);
  private readonly businessWorkspaceState = inject(BusinessWorkspaceStateService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);

  protected readonly user = this.userService.getUser();
  protected readonly businesses = this.businessWorkspaceState.knownBusinesses;
  protected readonly selectedBusinessId = this.businessWorkspaceState.businessId;
  protected readonly currentBusiness = signal<BusinessModel | null>(null);
  protected readonly mode = signal<WorkspaceMode>('view');
  protected readonly listLoading = signal(true);
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
  protected readonly hasBusinesses = computed(() => this.businesses().length > 0);
  protected readonly showStandaloneEmptyState = computed(
    () => !this.listLoading() && !this.businesses().length && !this.currentBusiness(),
  );
  protected readonly showWorkspaceLoadingState = computed(
    () => !this.currentBusiness() && (this.listLoading() || this.detailLoading()),
  );
  protected readonly showWorkspaceUnavailableState = computed(
    () => !this.listLoading() && !this.detailLoading() && this.hasBusinesses() && !this.currentBusiness(),
  );
  protected readonly activeSidebarBusinessId = computed(() =>
    this.isEditorMode() ? null : this.selectedBusinessId(),
  );

  protected readonly pageTitle = computed(() =>
    this.isCreateMode() ? 'Create a new business' : this.isEditMode() ? 'Edit business' : 'Manage your business',
  );

  protected readonly pageDescription = computed(() =>
    this.isCreateMode()
      ? 'New business setup stays separate from your current workspace until you save it.'
      : this.isEditMode()
        ? 'Changes stay separate from the workspace view until you save the update.'
        : 'Keep venue details current, follow approval status, and prepare the workspace for rescue offer publishing.',
  );

  protected readonly editorEyebrow = computed(() =>
    this.isCreateMode() ? 'Business details' : 'Edit',
  );

  protected readonly editorTitle = computed(() =>
    this.isCreateMode() ? 'Set up your venue profile' : 'Update business details',
  );

  protected readonly editorDescription = computed(() =>
    this.isCreateMode()
      ? 'Start with the essentials now. You can refine the venue profile again after creation.'
      : 'Make changes to the current venue profile and save when you are ready.',
  );

  protected readonly createSummaryTitle = computed(() => {
    const count = this.businesses().length;

    if (count === 0) {
      return 'Your first business starts here';
    }

    return count === 1 ? '1 business already in workspace' : `${count} businesses already in workspace`;
  });

  protected readonly createSummaryDescription = computed(() =>
    this.businesses().length
      ? 'Existing businesses stay unchanged while you prepare this new profile.'
      : 'Once you save this form, the business will appear in your workspace.',
  );

  protected readonly editorSummaryTitle = computed(() =>
    this.isCreateMode()
      ? this.createSummaryTitle()
      : this.currentBusiness()?.name ?? 'Return to workspace view',
  );

  protected readonly editorSummaryDescription = computed(() =>
    this.isCreateMode()
      ? this.createSummaryDescription()
      : 'Review the current workspace again whenever you want before saving these edits.',
  );

  protected readonly selectedStatusMeta = computed(() =>
    this.currentBusiness() ? BUSINESS_STATUS_META[this.currentBusiness()!.status] : null,
  );

  protected readonly canDeleteBusiness = computed(
    () => this.user()?.role !== UserRoleEnum.ADMIN && !!this.currentBusiness(),
  );

  protected readonly canCreateOffer = computed(() => this.selectedStatusMeta()?.offerCreationAllowed ?? false);
  protected readonly createOfferHint = computed(() =>
    this.canCreateOffer() ? null : this.selectedStatusMeta()?.description ?? 'Offer creation is unavailable right now.',
  );

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const rawId = Number(params.get('id'));
      const routeBusinessId = Number.isInteger(rawId) && rawId > 0 ? rawId : null;
      this.loadWorkspace(routeBusinessId);
    });
  }

  protected openBusinessFromSidebar(item: BusinessWorkspaceListItem): void {
    if (this.selectedBusinessId() === item.id || this.detailLoading()) {
      return;
    }

    this.mode.set('view');
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
    this.businessWorkspaceState.rememberBusinessId(item.id);
    this.location.go(`/business/${item.id}`);
    this.loadBusiness(item.id, true);
  }

  protected startCreateBusiness(): void {
    this.mode.set('create');
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
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
    this.mode.set('view');

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
    if (this.mode() === 'create') {
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

  protected refreshWorkspace(): void {
    const currentId = this.selectedBusinessId();
    this.errorMessage.set(null);

    this.businessWorkspaceState.refreshBusinesses().subscribe({
      next: (items) => {
        const nextId = currentId && items.some((item) => item.id === currentId) ? currentId : items[0]?.id ?? null;

        if (!nextId) {
          this.currentBusiness.set(null);
          this.businessWorkspaceState.clearRememberedBusinessId();
          this.location.go('/business');
          return;
        }

        this.businessWorkspaceState.rememberBusinessId(nextId);
        if (currentId !== nextId) {
          this.location.go(`/business/${nextId}`);
        }
        this.loadBusiness(nextId, true);
      },
      error: () => {
        this.notificationService.error('Workspace list could not be refreshed.');
      },
    });
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
        next: (items) => {
          this.detailLoading.set(false);
          this.notificationService.info('Business was deleted.', 'Business removed');

          const nextId = items[0]?.id ?? null;
          if (!nextId) {
            this.businessWorkspaceState.clearRememberedBusinessId();
            this.currentBusiness.set(null);
            this.mode.set('view');
            this.location.go('/business');
            return;
          }

          this.businessWorkspaceState.rememberBusinessId(nextId);
          this.location.go(`/business/${nextId}`);
          this.loadBusiness(nextId, false);
        },
        error: () => {
          this.detailLoading.set(false);
          this.notificationService.error('Business could not be deleted.');
        },
      });
  }

  protected triggerOfferCreation(): void {
    if (!this.canCreateOffer()) {
      return;
    }

    this.notificationService.info('Offer creation will be connected once the offers flow is ready.', 'Coming next');
  }

  protected openBusinessOffers(): void {
    this.notificationService.info(
      'Business offers view will be connected once the business offers flow is ready.',
      'Coming next',
    );
  }

  protected contactSupport(): void {
    this.notificationService.info('Support contact is frontend-only for now.', 'Need help?');
  }

  protected statusLabel(status: BusinessStatus): string {
    return BUSINESS_STATUS_META[status].label;
  }

  protected statusTone(status: BusinessStatus): BusinessStatusMeta['tone'] {
    return BUSINESS_STATUS_META[status].tone;
  }

  protected showFieldError(fieldName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[fieldName];
    return this.submitAttempted() && control.invalid;
  }

  protected formatBusinessId(id: number): string {
    return id.toString().padStart(5, '0');
  }

  private loadWorkspace(routeBusinessId: number | null): void {
    this.listLoading.set(true);

    this.businessWorkspaceState.refreshBusinesses().subscribe({
      next: (items) => {
        this.listLoading.set(false);

        if (this.mode() !== 'view') {
          return;
        }

        const rememberedId = this.selectedBusinessId();
        const nextId =
          (routeBusinessId && items.some((item) => item.id === routeBusinessId) && routeBusinessId) ||
          (rememberedId && items.some((item) => item.id === rememberedId) && rememberedId) ||
          items[0]?.id ||
          null;

        if (!nextId) {
          this.businessWorkspaceState.clearRememberedBusinessId();
          this.currentBusiness.set(null);
          this.location.go('/business');
          return;
        }

        this.businessWorkspaceState.rememberBusinessId(nextId);
        if (routeBusinessId && routeBusinessId !== nextId) {
          this.location.go(`/business/${nextId}`);
        }

        if (this.currentBusiness()?.id !== nextId) {
          this.loadBusiness(nextId, !!this.currentBusiness());
        }
      },
      error: () => {
        this.listLoading.set(false);
        this.errorMessage.set('We could not load the business list right now.');
        this.notificationService.error('Workspace list could not be loaded.');
      },
    });
  }

  private loadBusiness(id: number, preserveCurrent: boolean): void {
    this.detailLoading.set(true);

    if (!preserveCurrent) {
      this.currentBusiness.set(null);
    }

    this.businessApi.getBusiness(id).subscribe({
      next: (business) => {
        this.detailLoading.set(false);
        this.currentBusiness.set(business);
        this.mode.set('view');
        this.businessWorkspaceState.rememberBusinessId(business.id);
        this.businessWorkspaceState.rememberBusinessSummary(business);
      },
      error: () => {
        this.detailLoading.set(false);
        this.notificationService.error('Business details could not be loaded.');
      },
    });
  }

  private createBusiness(payload: BusinessPayload): void {
    const existingIds = new Set(this.businesses().map((item) => item.id));
    this.detailLoading.set(true);

    this.businessApi
      .createBusiness(payload)
      .pipe(switchMap(() => this.businessWorkspaceState.refreshBusinesses()))
      .subscribe({
        next: (items) => {
          this.detailLoading.set(false);
          this.mode.set('view');

          const nextBusiness =
            items.find((item) => !existingIds.has(item.id)) ??
            [...items].sort((first, second) => second.id - first.id)[0] ??
            null;

          this.notificationService.success('Business was created successfully.', 'Business saved');

          if (!nextBusiness) {
            this.currentBusiness.set(null);
            this.location.go('/business');
            return;
          }

          this.businessWorkspaceState.rememberBusinessId(nextBusiness.id);
          this.location.go(`/business/${nextBusiness.id}`);
          this.loadBusiness(nextBusiness.id, false);
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
