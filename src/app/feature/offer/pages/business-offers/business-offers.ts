import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { BUSINESS_STATUS_META, BusinessModel } from '../../../../shared/models/business.model';
import { WorkspacePageSkeletonComponent } from '../../../../shared/ui/workspace-page-skeleton/workspace-page-skeleton';
import {
  AllergenCode,
  ALLERGEN_OPTIONS,
  CreateOfferPayload,
  LOCAL_OFFER_IMAGE_OPTIONS,
  OFFER_CATEGORY_OPTIONS,
  OfferCategory,
  OfferImageOption,
  OfferItemModel,
  OfferModel,
  OfferPayload,
} from '../../models/offer.model';
import { GeneratedOfferImageModel, OfferDraftSuggestionModel } from '../../models/offer-assistant.model';
import { OfferApiService } from '../../services/offer-api.service';
import { OfferAssistantApiService } from '../../services/offer-assistant-api.service';
import { OfferImageApiService } from '../../services/offer-image-api.service';
import { BusinessOfferActionBarComponent } from './components/business-offer-action-bar/business-offer-action-bar.component';
import { BusinessOfferAiDraftComponent } from './components/business-offer-ai-draft/business-offer-ai-draft.component';
import { BusinessOfferAllergensFormComponent } from './components/business-offer-allergens-form/business-offer-allergens-form.component';
import { BusinessOfferBasicsFormComponent } from './components/business-offer-basics-form/business-offer-basics-form.component';
import { BusinessOfferContentsFormComponent } from './components/business-offer-contents-form/business-offer-contents-form.component';
import { BusinessOfferDetailComponent } from './components/business-offer-detail/business-offer-detail.component';
import { BusinessOfferFlowChoiceComponent } from './components/business-offer-flow-choice/business-offer-flow-choice.component';
import { BusinessOfferImagePickerComponent } from './components/business-offer-image-picker/business-offer-image-picker.component';
import { EditorImageAsset, OfferFinalImageSource } from './components/business-offer-image-picker/business-offer-image-picker.models';
import { BusinessOfferPickupSchedulerComponent } from './components/business-offer-pickup-scheduler/business-offer-pickup-scheduler.component';
import { BusinessOfferPricingFormComponent } from './components/business-offer-pricing-form/business-offer-pricing-form.component';
import { BusinessOfferStepperComponent } from './components/business-offer-stepper/business-offer-stepper.component';
import { BusinessOffersCatalogComponent } from './components/business-offers-catalog/business-offers-catalog.component';
import {
  DraftDetectedItem,
  formatBusinessOfferDetectedItemLabel,
  normalizeBusinessOfferDetectedItemQuantity,
  parseBusinessOfferDetectedItemLabel,
} from './business-offers-draft.utils';
import {
  filterBusinessOfferAllergenOptions,
  matchesBusinessOfferAddress,
  sortBusinessOfferAllergens,
} from './business-offers-form.utils';
import {
  OfferEditorFlowChoice,
  OfferEditorMode,
  OfferEditorStep,
  PickupCalendarCell,
  PickupSchedulePanel,
  PickupTimeFieldName,
} from './business-offers.models';
import {
  buildBusinessOfferPickupControlValues,
  businessOfferPickupWindowRollsToNextDay,
  formatBusinessOfferDateOnly,
  parseBusinessOfferDateOnly,
  parseBusinessOfferDateTimeLocalParts,
  parseBusinessOfferTimeToMinutes,
  resolveBusinessOfferDefaultPickupTime,
  resolveBusinessOfferPickupBaseDateLabel,
  resolveBusinessOfferPickupCalendarDays,
  resolveBusinessOfferPickupTimePart,
  resolveBusinessOfferPickupWindowSummary,
  resolveBusinessOfferStartOfMonthString,
  resolveBusinessOfferTodayDateString,
  toBusinessOfferDateTimeLocalValue,
  toBusinessOfferIsoString,
} from './business-offers-pickup.utils';
import { businessOfferStatusMeta } from './business-offers-presenter.utils';

@Component({
  selector: 'app-business-offers-page',
  imports: [
    ReactiveFormsModule,
    FontAwesomeModule,
    ActionButtonComponent,
    BusinessOfferActionBarComponent,
    BusinessOfferAiDraftComponent,
    BusinessOfferAllergensFormComponent,
    BusinessOfferBasicsFormComponent,
    BusinessOfferContentsFormComponent,
    BusinessOfferDetailComponent,
    BusinessOfferFlowChoiceComponent,
    BusinessOfferImagePickerComponent,
    BusinessOfferPickupSchedulerComponent,
    BusinessOfferPricingFormComponent,
    BusinessOfferStepperComponent,
    BusinessOffersCatalogComponent,
    WorkspacePageSkeletonComponent,
  ],
  templateUrl: './business-offers.html',
  styleUrl: './business-offers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class BusinessOffersPage {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly offerApi = inject(OfferApiService);
  private readonly offerAssistantApi = inject(OfferAssistantApiService);
  private readonly offerImageApi = inject(OfferImageApiService);
  private readonly notificationService = inject(NotificationService);

  protected readonly icons = appIcons;
  protected readonly imageOptions = LOCAL_OFFER_IMAGE_OPTIONS;
  protected readonly categoryOptions = OFFER_CATEGORY_OPTIONS;
  protected readonly allergenOptions = ALLERGEN_OPTIONS;
  protected readonly countries = ['Slovakia', 'Czechia', 'Austria', 'Hungary', 'Poland'];
  protected readonly titleMaxLength = 160;
  protected readonly descriptionMaxLength = 1000;
  protected readonly pickupNoteMaxLength = 255;
  protected readonly otherAllergenNoteMaxLength = 500;
  protected readonly detectedItemPreviewLimit = 5;
  protected readonly business = signal<BusinessModel | null>(null);
  protected readonly offers = signal<OfferModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly draftingFromImage = signal(false);
  protected readonly generatingCover = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly selectedOfferId = signal<number | null>(null);
  protected readonly mode = signal<OfferEditorMode>('view');
  protected readonly removingIds = signal<number[]>([]);
  protected readonly finalImageSource = signal<OfferFinalImageSource>('manual-url');
  protected readonly originalPhotoAsset = signal<EditorImageAsset | null>(null);
  protected readonly ownImageAsset = signal<EditorImageAsset | null>(null);
  protected readonly aiCoverAsset = signal<EditorImageAsset | null>(null);
  protected readonly aiDraftSuggestion = signal<OfferDraftSuggestionModel | null>(null);
  protected readonly aiDetectedItems = signal<string[]>([]);
  protected readonly containsAllergenQuery = signal('');
  protected readonly mayContainAllergenQuery = signal('');
  protected readonly pickupBaseDate = signal('');
  protected readonly pickupFromTime = signal('');
  protected readonly pickupToTime = signal('');
  protected readonly pickupSchedulePanel = signal<PickupSchedulePanel | null>(null);
  protected readonly pickupCalendarMonth = signal(
    resolveBusinessOfferStartOfMonthString(resolveBusinessOfferTodayDateString()),
  );
  protected readonly editorFlowChoice = signal<OfferEditorFlowChoice>('undecided');
  protected readonly editorCurrentStep = signal<OfferEditorStep>('entry');
  protected readonly pickupCalendarWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
  protected readonly pickupQuickTimePresets = ['08:00', '10:00', '12:00', '15:00', '18:00', '20:00'] as const;
  protected readonly pickupHourOptions = Array.from({ length: 24 }, (_, index) => `${index}`.padStart(2, '0'));
  protected readonly pickupMinuteOptions = Array.from({ length: 60 }, (_, index) => `${index}`.padStart(2, '0'));
  protected readonly isEditorMode = computed(() => this.mode() === 'create' || this.mode() === 'edit');
  protected readonly editorPageTitle = computed(() => (this.mode() === 'edit' ? 'Edit offer' : 'Create offer'));
  protected readonly editorVisibleSteps = computed<OfferEditorStep[]>(() => {
    if (this.mode() === 'edit') {
      return ['details', 'operations'] as const;
    }

    if (this.editorFlowChoice() === 'ai') {
      return ['entry', 'ai', 'details', 'operations'] as const;
    }

    if (this.editorFlowChoice() === 'manual') {
      return ['entry', 'details', 'operations'] as const;
    }

    return ['entry'] as const;
  });
  protected readonly visibleDetectedItems = computed(() =>
    this.aiDetectedItems().slice(0, this.detectedItemPreviewLimit),
  );
  protected readonly hiddenDetectedItemCount = computed(() =>
    Math.max(0, this.aiDetectedItems().length - this.detectedItemPreviewLimit),
  );
  protected readonly filteredContainsAllergenOptions = computed(() =>
    filterBusinessOfferAllergenOptions(this.allergenOptions, this.containsAllergenQuery()),
  );
  protected readonly filteredMayContainAllergenOptions = computed(() =>
    filterBusinessOfferAllergenOptions(this.allergenOptions, this.mayContainAllergenQuery()),
  );
  protected readonly pickupCalendarMonthLabel = computed(() => {
    const monthDate = parseBusinessOfferDateOnly(this.pickupCalendarMonth());
    if (!monthDate) {
      return '';
    }

    return new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
    }).format(monthDate);
  });
  protected readonly pickupCalendarDays = computed<PickupCalendarCell[]>(() => {
    return resolveBusinessOfferPickupCalendarDays(
      this.pickupCalendarMonth(),
      this.pickupBaseDate(),
      resolveBusinessOfferTodayDateString(),
    );
  });
  protected readonly businessProfileAddressLabel = computed(() => {
    const business = this.business();
    if (!business) {
      return '';
    }

    return [
      business.address.street,
      business.address.city,
      business.address.postalCode,
      business.address.country,
    ]
      .filter(Boolean)
      .join(', ');
  });

  protected readonly selectedOffer = computed(
    () => this.offers().find((offer) => offer.id === this.selectedOfferId()) ?? null,
  );
  protected readonly businessStatusMeta = computed(() =>
    this.business() ? BUSINESS_STATUS_META[this.business()!.status] : null,
  );
  protected readonly canCreateOffer = computed(() => this.businessStatusMeta()?.offerCreationAllowed ?? false);
  protected readonly offerCount = computed(() => this.offers().length);
  protected readonly selectedFinalImagePreview = computed(() => {
    switch (this.finalImageSource()) {
      case 'original-photo':
        return this.originalPhotoAsset()?.previewUrl ?? null;
      case 'own-upload':
        return this.ownImageAsset()?.previewUrl ?? null;
      case 'ai-cover':
        return this.aiCoverAsset()?.previewUrl ?? null;
      case 'manual-url': {
        const imageUrl = this.form.controls.imageUrl.value.trim();
        return imageUrl || null;
      }
    }
  });
  protected readonly selectedFinalImageIllustrative = computed(() =>
    this.finalImageSource() === 'ai-cover' || this.form.controls.illustrativeImage.value,
  );
  protected readonly pageDescription = computed(() => {
    if (this.canCreateOffer()) {
      return 'Create, update, and maintain live rescue offers for this business from one workspace, including AI-assisted draft helpers.';
    }

    return 'The business is not active yet, so new offers stay locked. You can still review the catalog setup and prepare image links.';
  });

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(this.titleMaxLength)]],
    description: ['', [Validators.required, Validators.maxLength(this.descriptionMaxLength)]],
    imageUrl: ['', [Validators.maxLength(1024)]],
    category: this.fb.nonNullable.control<OfferCategory>('MIXED'),
    illustrativeImage: this.fb.nonNullable.control(false),
    containsAllergens: this.fb.nonNullable.control<AllergenCode[]>([]),
    mayContainAllergens: this.fb.nonNullable.control<AllergenCode[]>([]),
    otherAllergenNote: ['', [Validators.maxLength(this.otherAllergenNoteMaxLength)]],
    price: [4.9, [Validators.required, Validators.min(0)]],
    originalPrice: this.fb.control<number | null>(null, [Validators.min(0)]),
    quantityAvailable: [1, [Validators.required, Validators.min(1)]],
    useBusinessProfileAddress: this.fb.nonNullable.control(true),
    pickupStreet: ['', [Validators.required, Validators.maxLength(255)]],
    pickupCity: ['', [Validators.required, Validators.maxLength(100)]],
    pickupPostalCode: ['', [Validators.required, Validators.maxLength(20)]],
    pickupCountry: ['Slovakia', [Validators.required, Validators.maxLength(100)]],
    pickupNote: ['', [Validators.maxLength(this.pickupNoteMaxLength)]],
    pickupFrom: ['', [Validators.required]],
    pickupTo: ['', [Validators.required]],
    items: this.fb.array([this.createOfferItemGroup()]),
  });

  constructor() {
    this.form.controls.useBusinessProfileAddress.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((useBusinessProfileAddress) => {
        if (useBusinessProfileAddress) {
          this.applyBusinessProfileAddress();
        }
      });

    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      const resolvedBusiness = (data['business'] as BusinessModel | null | undefined) ?? null;

      if (!resolvedBusiness) {
        this.business.set(null);
        this.offers.set([]);
        this.loading.set(false);
        this.errorMessage.set('Business offers could not be opened right now.');
        return;
      }

      this.business.set(resolvedBusiness);
      this.errorMessage.set(null);
      this.mode.set('view');
      this.loadOffers();
    });
  }

  @HostListener('document:keydown.escape')
  protected handleEscapeKey(): void {
    this.closePickupSchedulePanel();
  }

  @HostListener('document:click', ['$event'])
  protected handleDocumentClick(event: MouseEvent): void {
    if (!this.pickupSchedulePanel()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('.create-offer-schedule__picker')) {
      return;
    }

    this.closePickupSchedulePanel();
  }

  protected refreshOffers(): void {
    this.loadOffers();
  }

  protected startCreateOffer(): void {
    const business = this.business();
    if (!business || !this.canCreateOffer()) {
      return;
    }

    this.mode.set('create');
    this.editorFlowChoice.set('undecided');
    this.editorCurrentStep.set('entry');
    this.selectedOfferId.set(null);
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
    this.aiDraftSuggestion.set(null);
    this.finalImageSource.set('manual-url');
    this.originalPhotoAsset.set(null);
    this.ownImageAsset.set(null);
    this.aiCoverAsset.set(null);
    this.aiDetectedItems.set([]);
    this.containsAllergenQuery.set('');
    this.mayContainAllergenQuery.set('');
    this.closePickupSchedulePanel();
    this.form.reset({
      title: '',
      description: '',
      imageUrl: '',
      category: 'MIXED',
      illustrativeImage: false,
      containsAllergens: [],
      mayContainAllergens: [],
      otherAllergenNote: '',
      price: 4.9,
      originalPrice: null,
      quantityAvailable: 1,
      useBusinessProfileAddress: true,
      pickupStreet: business.address.street,
      pickupCity: business.address.city,
      pickupPostalCode: business.address.postalCode,
      pickupCountry: business.address.country,
      pickupNote: '',
      pickupFrom: '',
      pickupTo: '',
      items: [],
    });
    this.resetOfferItems();
    this.syncPickupDraftFromForm();
  }

  protected selectOffer(offerId: number): void {
    this.selectedOfferId.set(offerId);
    this.mode.set('view');
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
    this.closePickupSchedulePanel();
  }

  protected startEditOffer(offer: OfferModel): void {
    if (!businessOfferStatusMeta(offer.status).editable) {
      return;
    }

    this.selectedOfferId.set(offer.id);
    this.mode.set('edit');
    this.editorFlowChoice.set('manual');
    this.editorCurrentStep.set('details');
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
    this.aiDraftSuggestion.set(null);
    this.originalPhotoAsset.set(null);
    this.ownImageAsset.set(null);
    this.aiCoverAsset.set(null);
    this.aiDetectedItems.set(
      offer.items.map((item) => formatBusinessOfferDetectedItemLabel(item.name, item.quantity)),
    );
    this.containsAllergenQuery.set('');
    this.mayContainAllergenQuery.set('');
    this.finalImageSource.set('manual-url');
    this.closePickupSchedulePanel();
    this.patchForm(offer);
  }

  protected cancelEditing(): void {
    this.mode.set('view');
    this.editorFlowChoice.set('undecided');
    this.editorCurrentStep.set('entry');
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
    this.aiDraftSuggestion.set(null);
    this.containsAllergenQuery.set('');
    this.mayContainAllergenQuery.set('');
    this.closePickupSchedulePanel();
  }

  protected async saveOffer(): Promise<void> {
    this.submitAttempted.set(true);
    this.errorMessage.set(null);

    if (this.form.invalid || this.isPickupWindowInvalid() || this.isOriginalPriceInvalid()) {
      return;
    }

    const business = this.business();
    if (!business) {
      return;
    }

    this.saving.set(true);

    try {
      const selectedImage = await this.resolveSelectedImageForSubmission(business.id);
      const payload = this.buildPayload(selectedImage.imageUrl, selectedImage.illustrativeImage);

      if (this.mode() === 'create') {
        const createPayload: CreateOfferPayload = {
          businessId: business.id,
          ...payload,
        };

        await firstValueFrom(this.offerApi.createOffer(createPayload));
        this.mode.set('view');
        this.notificationService.success('Offer was created successfully.', 'Offer saved');
        this.loadOffers();
        return;
      }

      const offer = this.selectedOffer();
      if (!offer) {
        return;
      }

      const updatedOffer = await firstValueFrom(this.offerApi.updateOffer(offer.id, payload));
      this.mode.set('view');
      this.offers.update((offers) =>
        offers.map((existingOffer) => (existingOffer.id === updatedOffer.id ? updatedOffer : existingOffer)),
      );
      this.selectedOfferId.set(updatedOffer.id);
      this.notificationService.success('Offer details were updated.', 'Offer saved');
    } catch {
      this.errorMessage.set('We could not save the offer changes right now. Please try again.');
      this.notificationService.error('Offer changes could not be saved.');
    } finally {
      this.saving.set(false);
    }
  }

  protected deleteOffer(offer: OfferModel): void {
    if (!businessOfferStatusMeta(offer.status).deletable || this.removingIds().includes(offer.id)) {
      return;
    }

    const confirmed = confirm(`Delete "${offer.title}"?`);
    if (!confirmed) {
      return;
    }

    this.removingIds.update((ids) => [...ids, offer.id]);
    this.offerApi.deleteOffer(offer.id).subscribe({
      next: () => {
        this.notificationService.info('Offer was removed from the catalog.', 'Offer deleted');
        if (this.selectedOfferId() === offer.id) {
          this.selectedOfferId.set(null);
          this.mode.set('view');
        }
        this.removeRemovingId(offer.id);
        this.loadOffers();
      },
      error: () => {
        this.removeRemovingId(offer.id);
        this.notificationService.error('Offer could not be deleted.');
      },
    });
  }

  protected addOfferItem(): void {
    this.offerItemsArray().push(this.createOfferItemGroup());
  }

  protected removeOfferItem(index: number): void {
    if (this.offerItemsArray().length <= 1) {
      return;
    }

    this.offerItemsArray().removeAt(index);
  }

  protected applyImagePreset(option: OfferImageOption): void {
    this.finalImageSource.set('manual-url');
    this.form.controls.imageUrl.setValue(option.url);
    this.form.controls.illustrativeImage.setValue(false);
  }

  protected async onOriginalPhotoSelected(event: Event): Promise<void> {
    const asset = await this.readImageAssetFromEvent(event);
    this.originalPhotoAsset.set(asset);
    this.aiDraftSuggestion.set(null);
    this.aiDetectedItems.set([]);
    if (asset) {
      this.finalImageSource.set('original-photo');
      this.form.controls.illustrativeImage.setValue(false);
    }
  }

  protected async onOwnImageSelected(event: Event): Promise<void> {
    const asset = await this.readImageAssetFromEvent(event);
    this.ownImageAsset.set(asset);
    if (asset) {
      this.finalImageSource.set('own-upload');
      this.form.controls.illustrativeImage.setValue(false);
    }
  }

  protected removeOriginalPhoto(): void {
    this.originalPhotoAsset.set(null);
    this.aiDraftSuggestion.set(null);
    this.aiDetectedItems.set([]);

    if (this.finalImageSource() === 'original-photo') {
      this.finalImageSource.set('manual-url');
    }
  }

  protected removeOwnUploadedImage(): void {
    this.ownImageAsset.set(null);

    if (this.finalImageSource() === 'own-upload') {
      this.finalImageSource.set('manual-url');
    }
  }

  protected removeAiCover(): void {
    this.aiCoverAsset.set(null);

    if (this.finalImageSource() === 'ai-cover') {
      this.finalImageSource.set('manual-url');
      this.form.controls.illustrativeImage.setValue(false);
    }
  }

  protected async autofillDraftFromPhoto(): Promise<void> {
    const business = this.business();
    const asset = this.originalPhotoAsset();

    if (!business || !asset) {
      this.notificationService.info('Upload the food photo first so AI can analyze it.', 'Photo needed');
      return;
    }

    this.draftingFromImage.set(true);

    try {
      const suggestion = await firstValueFrom(this.offerAssistantApi.createOfferDraftFromImage({
        businessId: business.id,
        fileName: asset.fileName,
        contentType: asset.contentType,
        imageBase64: asset.imageBase64,
      }));
      this.applyDraftSuggestion(suggestion);
      this.notificationService.success('AI draft suggestions were added to the editor.', 'Draft ready');
    } catch {
      this.notificationService.error('AI could not analyze the uploaded food photo right now.');
    } finally {
      this.draftingFromImage.set(false);
    }
  }

  protected async generateIllustrativeCover(): Promise<void> {
    const business = this.business();
    const title = this.form.controls.title.value.trim();

    if (!business) {
      return;
    }

    if (!title) {
      this.notificationService.info('Add the offer title first so the illustrative cover can stay relevant.', 'Title needed');
      return;
    }

    this.generatingCover.set(true);

    try {
      const generatedImage = await firstValueFrom(this.offerAssistantApi.generateOfferCover({
        businessId: business.id,
        title,
        description: this.form.controls.description.value.trim() || null,
        category: this.form.controls.category.value,
        detectedItems: this.detectedItemsForCover(),
      }));
      this.aiCoverAsset.set(this.generatedImageToAsset(generatedImage));
      this.finalImageSource.set('ai-cover');
      this.form.controls.illustrativeImage.setValue(true);
      this.notificationService.success('Illustrative cover image is ready for review.', 'Cover generated');
    } catch {
      this.notificationService.error('AI could not generate an illustrative cover right now.');
    } finally {
      this.generatingCover.set(false);
    }
  }

  protected selectFinalImageSource(source: OfferFinalImageSource): void {
    this.finalImageSource.set(source);

    if (source === 'ai-cover') {
      this.form.controls.illustrativeImage.setValue(true);
      return;
    }

    if (source === 'manual-url' && this.shouldPreserveExistingIllustrativeFlag()) {
      this.form.controls.illustrativeImage.setValue(true);
      return;
    }

    this.form.controls.illustrativeImage.setValue(false);
  }

  protected onManualImageUrlInput(): void {
    if (this.finalImageSource() !== 'manual-url') {
      return;
    }

    if (!this.shouldPreserveExistingIllustrativeFlag()) {
      this.form.controls.illustrativeImage.setValue(false);
    }
  }

  protected offerItemControls(): FormGroup[] {
    return this.offerItemsArray().controls as FormGroup[];
  }

  protected editorStatusLabel(): string {
    if (this.saving()) {
      return 'Saving draft...';
    }

    if (this.form.dirty) {
      return 'Unsaved changes';
    }

    return 'Draft ready to save';
  }

  protected editorStatusTone(): 'saved' | 'saving' | 'unsaved' {
    if (this.saving()) {
      return 'saving';
    }

    if (this.form.dirty) {
      return 'unsaved';
    }

    return 'saved';
  }

  protected isPickupWindowInvalid(): boolean {
    const baseDate = this.pickupBaseDate();
    const fromMinutes = parseBusinessOfferTimeToMinutes(this.pickupFromTime());
    const toMinutes = parseBusinessOfferTimeToMinutes(this.pickupToTime());

    if (!baseDate || fromMinutes === null || toMinutes === null) {
      return false;
    }

    return fromMinutes === toMinutes;
  }

  protected isOriginalPriceInvalid(): boolean {
    const { price, originalPrice } = this.form.getRawValue();

    if (originalPrice === null) {
      return false;
    }

    return originalPrice < price;
  }

  protected toggleContainsAllergen(code: AllergenCode): void {
    this.toggleAllergenSelection('containsAllergens', 'mayContainAllergens', code);
  }

  protected toggleMayContainAllergen(code: AllergenCode): void {
    this.toggleAllergenSelection('mayContainAllergens', 'containsAllergens', code);
  }

  protected updateContainsAllergenQuery(value: string): void {
    this.containsAllergenQuery.set(value);
  }

  protected updateMayContainAllergenQuery(value: string): void {
    this.mayContainAllergenQuery.set(value);
  }

  protected startWithAiDraft(): void {
    this.editorFlowChoice.set('ai');
    this.editorCurrentStep.set('ai');
  }

  protected startManualSetup(): void {
    this.editorFlowChoice.set('manual');
    this.editorCurrentStep.set('details');
  }

  protected goToEditorStep(step: OfferEditorStep): void {
    if (!this.visibleEditorSteps().includes(step)) {
      return;
    }

    this.editorCurrentStep.set(step);
  }

  protected goToPreviousStep(): void {
    const visibleSteps = this.visibleEditorSteps();
    const currentIndex = visibleSteps.indexOf(this.editorCurrentStep());
    if (currentIndex <= 0) {
      return;
    }

    this.editorCurrentStep.set(visibleSteps[currentIndex - 1]);
  }

  protected goToNextStep(): void {
    if (this.mode() === 'create' && this.editorCurrentStep() === 'entry' && this.editorFlowChoice() === 'undecided') {
      return;
    }

    if (!this.canLeaveCurrentEditorStep()) {
      this.markCurrentStepTouched();
      return;
    }

    const visibleSteps = this.visibleEditorSteps();
    const currentIndex = visibleSteps.indexOf(this.editorCurrentStep());
    if (currentIndex < 0 || currentIndex >= visibleSteps.length - 1) {
      return;
    }

    this.editorCurrentStep.set(visibleSteps[currentIndex + 1]);
  }

  protected pickupBaseDateValue(): string {
    return this.pickupBaseDate();
  }

  protected pickupBaseDateLabel(): string {
    return resolveBusinessOfferPickupBaseDateLabel(this.pickupBaseDate());
  }

  protected pickupTimeValue(fieldName: PickupTimeFieldName): string {
    return fieldName === 'pickupFrom' ? this.pickupFromTime() : this.pickupToTime();
  }

  protected isPickupSchedulePanelOpen(panel: PickupSchedulePanel): boolean {
    return this.pickupSchedulePanel() === panel;
  }

  protected togglePickupSchedulePanel(panel: PickupSchedulePanel): void {
    if (this.pickupSchedulePanel() === panel) {
      this.closePickupSchedulePanel();
      return;
    }

    if (panel === 'date') {
      this.syncPickupCalendarMonth(this.pickupBaseDate());
    }

    this.pickupSchedulePanel.set(panel);
  }

  protected closePickupSchedulePanel(): void {
    this.pickupSchedulePanel.set(null);
  }

  protected shiftPickupCalendarMonth(offset: number): void {
    const currentMonth = parseBusinessOfferDateOnly(this.pickupCalendarMonth())
      ?? parseBusinessOfferDateOnly(resolveBusinessOfferTodayDateString());
    if (!currentMonth) {
      return;
    }

    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
    this.pickupCalendarMonth.set(formatBusinessOfferDateOnly(nextMonth));
  }

  protected selectPickupRelativeDate(offsetDays: number): void {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + offsetDays);
    this.selectPickupDate(formatBusinessOfferDateOnly(nextDate));
  }

  protected selectPickupDate(value: string): void {
    this.updatePickupBaseDateValue(value);
    this.closePickupSchedulePanel();
  }

  protected updatePickupBaseDateValue(value: string): void {
    this.pickupBaseDate.set(value);
    this.syncPickupCalendarMonth(value);
    this.syncPickupControlsFromState();
  }

  protected updatePickupTimeValue(fieldName: PickupTimeFieldName, value: string): void {
    if (fieldName === 'pickupFrom') {
      this.pickupFromTime.set(value);
    } else {
      this.pickupToTime.set(value);
    }

    this.syncPickupControlsFromState();
  }

  protected applyPickupTimePreset(fieldName: PickupTimeFieldName, value: string): void {
    this.updatePickupTimeValue(fieldName, value);
    this.closePickupSchedulePanel();
  }

  protected clearPickupTimeValue(fieldName: PickupTimeFieldName): void {
    this.updatePickupTimeValue(fieldName, '');
  }

  protected pickupTimePart(fieldName: PickupTimeFieldName, part: 'hour' | 'minute'): string | null {
    return resolveBusinessOfferPickupTimePart(this.pickupTimeValue(fieldName), part);
  }

  protected selectPickupTimePart(fieldName: PickupTimeFieldName, part: 'hour' | 'minute', value: string): void {
    const fallbackTime = resolveBusinessOfferDefaultPickupTime(
      fieldName,
      this.pickupTimeValue(fieldName),
      fieldName === 'pickupFrom' ? this.pickupToTime() : this.pickupFromTime(),
    );
    const fallbackHour = fallbackTime.slice(0, 2);
    const fallbackMinute = fallbackTime.slice(3, 5);
    const currentHour = this.pickupTimePart(fieldName, 'hour');
    const currentMinute = this.pickupTimePart(fieldName, 'minute');
    const nextHour = part === 'hour' ? value : (currentHour ?? fallbackHour);
    const nextMinute = part === 'minute' ? value : (currentMinute ?? fallbackMinute);

    this.updatePickupTimeValue(fieldName, `${nextHour}:${nextMinute}`);

    if (part === 'minute') {
      this.closePickupSchedulePanel();
    }
  }

  protected pickupWindowRollsToNextDay(): boolean {
    return businessOfferPickupWindowRollsToNextDay(this.pickupFromTime(), this.pickupToTime());
  }

  protected pickupWindowSummary(): string | null {
    return resolveBusinessOfferPickupWindowSummary({
      baseDate: this.pickupBaseDate(),
      fromTime: this.pickupFromTime(),
      toTime: this.pickupToTime(),
    });
  }

  protected canGenerateAiCover(): boolean {
    return !!this.business() && !!this.form.controls.title.value.trim();
  }

  private loadOffers(): void {
    const business = this.business();
    if (!business) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    this.offerApi.getOffers(business.id).subscribe({
      next: (offers) => {
        this.offers.set(offers);
        this.loading.set(false);

        if (this.mode() === 'create') {
          return;
        }

        const selectedOfferId = this.selectedOfferId();
        const selectedOfferStillExists = selectedOfferId !== null && offers.some((offer) => offer.id === selectedOfferId);

        if (!selectedOfferStillExists) {
          this.selectedOfferId.set(offers[0]?.id ?? null);
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('We could not load offers for this business right now. Please try again.');
      },
    });
  }

  private buildPayload(imageUrl: string | null, illustrativeImage: boolean): OfferPayload {
    const rawValue = this.form.getRawValue();

    return {
      title: rawValue.title.trim(),
      description: rawValue.description.trim() || null,
      imageUrl,
      category: rawValue.category,
      illustrativeImage,
      containsAllergens: rawValue.containsAllergens,
      mayContainAllergens: rawValue.mayContainAllergens,
      otherAllergenNote: rawValue.otherAllergenNote.trim() || null,
      price: rawValue.price,
      originalPrice: rawValue.originalPrice,
      quantityAvailable: rawValue.quantityAvailable,
      items: rawValue.items.map((item) => ({
        name: item.name.trim(),
        quantity: item.quantity,
      })),
      pickupLocation: {
        address: {
          street: rawValue.pickupStreet.trim(),
          city: rawValue.pickupCity.trim(),
          postalCode: rawValue.pickupPostalCode.trim(),
          country: rawValue.pickupCountry.trim(),
        },
        note: rawValue.pickupNote.trim() || null,
      },
      pickupTimeWindow: {
        from: toBusinessOfferIsoString(rawValue.pickupFrom),
        to: toBusinessOfferIsoString(rawValue.pickupTo),
      },
    };
  }

  private patchForm(offer: OfferModel): void {
    const business = this.business();
    this.form.reset({
      title: offer.title,
      description: offer.description ?? '',
      imageUrl: offer.imageUrl ?? '',
      category: offer.category,
      illustrativeImage: offer.illustrativeImage,
      containsAllergens: offer.containsAllergens,
      mayContainAllergens: offer.mayContainAllergens,
      otherAllergenNote: offer.otherAllergenNote ?? '',
      price: offer.price,
      originalPrice: offer.originalPrice,
      quantityAvailable: offer.quantityAvailable,
      useBusinessProfileAddress: matchesBusinessOfferAddress(offer.pickupLocation.address, business?.address ?? null),
      pickupStreet: offer.pickupLocation.address.street,
      pickupCity: offer.pickupLocation.address.city,
      pickupPostalCode: offer.pickupLocation.address.postalCode,
      pickupCountry: offer.pickupLocation.address.country,
      pickupNote: offer.pickupLocation.note ?? '',
      pickupFrom: toBusinessOfferDateTimeLocalValue(offer.pickupTimeWindow.from),
      pickupTo: toBusinessOfferDateTimeLocalValue(offer.pickupTimeWindow.to),
      items: [],
    });
    this.resetOfferItems(offer.items);
    this.syncPickupDraftFromForm();
  }

  private resetOfferItems(items: OfferItemModel[] = [{ name: '', quantity: 1 }]): void {
    const itemsArray = this.offerItemsArray();

    while (itemsArray.length) {
      itemsArray.removeAt(0);
    }

    for (const item of items) {
      itemsArray.push(this.createOfferItemGroup(item.name, item.quantity));
    }
  }

  private createOfferItemGroup(name = '', quantity = 1) {
    return this.fb.nonNullable.group({
      name: [name, [Validators.required, Validators.maxLength(160)]],
      quantity: [quantity, [Validators.required, Validators.min(1)]],
    });
  }

  private offerItemsArray(): FormArray {
    return this.form.controls.items as FormArray;
  }

  private removeRemovingId(offerId: number): void {
    this.removingIds.update((ids) => ids.filter((currentId) => currentId !== offerId));
  }

  private async readImageAssetFromEvent(event: Event): Promise<EditorImageAsset | null> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (input) {
      input.value = '';
    }
    if (!file) {
      return null;
    }

    return await this.readImageFile(file);
  }

  private readImageFile(file: File): Promise<EditorImageAsset> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        const base64Index = dataUrl.indexOf('base64,');
        const imageBase64 = base64Index >= 0 ? dataUrl.slice(base64Index + 'base64,'.length) : '';

        resolve({
          fileName: file.name,
          contentType: file.type || 'image/jpeg',
          imageBase64,
          previewUrl: dataUrl,
        });
      };

      reader.onerror = () => reject(reader.error ?? new Error('Unable to read image file.'));
      reader.readAsDataURL(file);
    });
  }

  private applyDraftSuggestion(suggestion: OfferDraftSuggestionModel): void {
    this.aiDraftSuggestion.set(suggestion);
    const detectedItems = (suggestion.detectedItems ?? [])
      .map((item) => parseBusinessOfferDetectedItemLabel(item))
      .filter((item) => !!item.name.trim());

    this.aiDetectedItems.set(
      detectedItems.map((item) => formatBusinessOfferDetectedItemLabel(item.name, item.quantity)),
    );

    this.form.patchValue({
      title: suggestion.suggestedTitle || this.form.controls.title.value,
      description: suggestion.suggestedDescription ?? this.form.controls.description.value,
      category: suggestion.suggestedCategory ?? this.form.controls.category.value,
    });

    if (detectedItems.length) {
      this.resetOfferItems(
        detectedItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
        })),
      );
    }
  }

  private generatedImageToAsset(generatedImage: GeneratedOfferImageModel): EditorImageAsset {
    return {
      fileName: generatedImage.fileName,
      contentType: generatedImage.contentType,
      imageBase64: generatedImage.imageBase64,
      previewUrl: `data:${generatedImage.contentType};base64,${generatedImage.imageBase64}`,
    };
  }

  private detectedItemsForCover(): string[] {
    if (this.aiDetectedItems().length) {
      return this.aiDetectedItems();
    }

    return this.form.getRawValue().items
      .map((item) => formatBusinessOfferDetectedItemLabel(item.name.trim(), item.quantity))
      .filter((item) => !!item.trim());
  }

  private parseDetectedItemLabel(value: string): DraftDetectedItem {
    const normalizedValue = value.trim();
    const trailingCountMatch = normalizedValue.match(/^(.+?)\s*[x×]\s*(\d{1,2})$/i);
    if (trailingCountMatch) {
      return {
        name: trailingCountMatch[1].trim(),
        quantity: normalizeBusinessOfferDetectedItemQuantity(Number.parseInt(trailingCountMatch[2], 10)),
      };
    }

    const leadingCountMatch = normalizedValue.match(/^(\d{1,2})\s*[x×]\s*(.+)$/i);
    if (leadingCountMatch) {
      return {
        name: leadingCountMatch[2].trim(),
        quantity: normalizeBusinessOfferDetectedItemQuantity(Number.parseInt(leadingCountMatch[1], 10)),
      };
    }

    return {
      name: normalizedValue,
      quantity: 1,
    };
  }

  private async resolveSelectedImageForSubmission(
    businessId: number,
  ): Promise<{ imageUrl: string | null; illustrativeImage: boolean }> {
    switch (this.finalImageSource()) {
      case 'original-photo': {
        const asset = this.originalPhotoAsset();
        if (!asset) {
          throw new Error('Original photo is missing.');
        }
        const uploadedImage = await firstValueFrom(this.offerImageApi.uploadOfferImage({
          businessId,
          fileName: asset.fileName,
          contentType: asset.contentType,
          imageBase64: asset.imageBase64,
          illustrativeImage: false,
        }));
        return { imageUrl: uploadedImage.imageUrl, illustrativeImage: false };
      }

      case 'own-upload': {
        const asset = this.ownImageAsset();
        if (!asset) {
          throw new Error('Own uploaded image is missing.');
        }
        const uploadedImage = await firstValueFrom(this.offerImageApi.uploadOfferImage({
          businessId,
          fileName: asset.fileName,
          contentType: asset.contentType,
          imageBase64: asset.imageBase64,
          illustrativeImage: false,
        }));
        return { imageUrl: uploadedImage.imageUrl, illustrativeImage: false };
      }

      case 'ai-cover': {
        const asset = this.aiCoverAsset();
        if (!asset) {
          throw new Error('AI cover image is missing.');
        }
        const uploadedImage = await firstValueFrom(this.offerImageApi.uploadOfferImage({
          businessId,
          fileName: asset.fileName,
          contentType: asset.contentType,
          imageBase64: asset.imageBase64,
          illustrativeImage: true,
        }));
        return { imageUrl: uploadedImage.imageUrl, illustrativeImage: true };
      }

      case 'manual-url':
      default:
        return {
          imageUrl: this.form.controls.imageUrl.value.trim() || null,
          illustrativeImage: this.form.controls.illustrativeImage.value,
        };
    }
  }

  private toggleAllergenSelection(
    targetControlName: 'containsAllergens' | 'mayContainAllergens',
    otherControlName: 'containsAllergens' | 'mayContainAllergens',
    code: AllergenCode,
  ): void {
    const targetControl = this.form.controls[targetControlName];
    const otherControl = this.form.controls[otherControlName];
    const currentValues = [...this.form.controls[targetControlName].value];
    const otherValues = [...this.form.controls[otherControlName].value];
    const hasValue = currentValues.includes(code);

    if (hasValue) {
      targetControl.setValue(currentValues.filter((value) => value !== code));
      targetControl.markAsDirty();
      targetControl.markAsTouched();
      return;
    }

    const cleanedCurrentValues: AllergenCode[] = code === 'UNKNOWN'
      ? ['UNKNOWN']
      : [...currentValues.filter((value) => value !== 'UNKNOWN'), code];

    targetControl.setValue(sortBusinessOfferAllergens(this.allergenOptions, cleanedCurrentValues));
    otherControl.setValue(otherValues.filter((value) => value !== code));
    targetControl.markAsDirty();
    targetControl.markAsTouched();
    otherControl.markAsDirty();
    otherControl.markAsTouched();
  }

  private visibleEditorSteps(): OfferEditorStep[] {
    return [...this.editorVisibleSteps()];
  }

  private canLeaveCurrentEditorStep(): boolean {
    if (this.editorCurrentStep() !== 'details') {
      return true;
    }

    if (this.isOriginalPriceInvalid()) {
      return false;
    }

    const controls = this.form.controls;
    const requiredFieldsValid =
      controls.title.valid &&
      controls.description.valid &&
      controls.price.valid &&
      controls.quantityAvailable.valid;

    return requiredFieldsValid && this.offerItemControls().every((itemGroup) => itemGroup.valid);
  }

  private markCurrentStepTouched(): void {
    if (this.editorCurrentStep() !== 'details') {
      return;
    }

    this.form.controls.title.markAsTouched();
    this.form.controls.description.markAsTouched();
    this.form.controls.price.markAsTouched();
    this.form.controls.originalPrice.markAsTouched();
    this.form.controls.quantityAvailable.markAsTouched();

    for (const itemGroup of this.offerItemControls()) {
      itemGroup.markAllAsTouched();
    }
  }

  private syncPickupDraftFromForm(): void {
    const pickupFromParts = parseBusinessOfferDateTimeLocalParts(this.form.controls.pickupFrom.value);
    const pickupToParts = parseBusinessOfferDateTimeLocalParts(this.form.controls.pickupTo.value);

    this.pickupBaseDate.set(pickupFromParts.date);
    this.pickupFromTime.set(pickupFromParts.time);
    this.pickupToTime.set(pickupToParts.time);
    this.syncPickupCalendarMonth(pickupFromParts.date);
  }

  private syncPickupControlsFromState(): void {
    const { pickupFromValue, pickupToValue } = buildBusinessOfferPickupControlValues({
      baseDate: this.pickupBaseDate(),
      fromTime: this.pickupFromTime(),
      toTime: this.pickupToTime(),
    });
    const currentPickupFromValue = this.form.controls.pickupFrom.value;
    const currentPickupToValue = this.form.controls.pickupTo.value;
    const pickupFromChanged = currentPickupFromValue !== pickupFromValue;
    const pickupToChanged = currentPickupToValue !== pickupToValue;

    this.form.controls.pickupFrom.setValue(pickupFromValue);
    this.form.controls.pickupTo.setValue(pickupToValue);

    if (pickupFromChanged) {
      this.form.controls.pickupFrom.markAsDirty();
    }
    if (pickupToChanged) {
      this.form.controls.pickupTo.markAsDirty();
    }
    if (pickupFromValue || currentPickupFromValue) {
      this.form.controls.pickupFrom.markAsTouched();
    }
    if (pickupToValue || currentPickupToValue) {
      this.form.controls.pickupTo.markAsTouched();
    }
  }

  private shouldPreserveExistingIllustrativeFlag(): boolean {
    const offer = this.selectedOffer();
    if (!offer?.illustrativeImage) {
      return false;
    }

    return (offer.imageUrl ?? '').trim() === this.form.controls.imageUrl.value.trim();
  }

  private applyBusinessProfileAddress(): void {
    const business = this.business();
    if (!business) {
      return;
    }

    this.form.patchValue({
      pickupStreet: business.address.street,
      pickupCity: business.address.city,
      pickupPostalCode: business.address.postalCode,
      pickupCountry: business.address.country,
    });
  }

  private syncPickupCalendarMonth(value: string): void {
    this.pickupCalendarMonth.set(
      resolveBusinessOfferStartOfMonthString(value || resolveBusinessOfferTodayDateString()),
    );
  }
}
