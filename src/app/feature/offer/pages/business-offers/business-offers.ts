import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { firstValueFrom } from 'rxjs';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { AddressModel, BUSINESS_STATUS_META, BusinessModel } from '../../../business/models/business.model';
import {
  AllergenCode,
  ALLERGEN_OPTIONS,
  AllergenOption,
  CreateOfferPayload,
  formatAllergenLabel,
  LOCAL_OFFER_IMAGE_OPTIONS,
  OFFER_CATEGORY_OPTIONS,
  OFFER_STATUS_META,
  OfferCategory,
  OfferCategoryOption,
  OfferImageOption,
  OfferItemModel,
  OfferModel,
  OfferPayload,
  OfferStatus,
  OfferStatusMeta,
  resolveOfferImage,
} from '../../models/offer.model';
import { GeneratedOfferImageModel, OfferDraftSuggestionModel } from '../../models/offer-assistant.model';
import { OfferApiService } from '../../services/offer-api.service';
import { OfferAssistantApiService } from '../../services/offer-assistant-api.service';
import { OfferImageApiService } from '../../services/offer-image-api.service';

type OfferEditorMode = 'view' | 'create' | 'edit';
type OfferFinalImageSource = 'manual-url' | 'original-photo' | 'own-upload' | 'ai-cover';
type OfferEditorStep = 'entry' | 'ai' | 'details' | 'operations';
type OfferEditorFlowChoice = 'undecided' | 'ai' | 'manual';
type PickupSchedulePanel = 'date' | 'pickupFrom' | 'pickupTo';
type PickupTimeFieldName = 'pickupFrom' | 'pickupTo';

interface EditorImageAsset {
  fileName: string;
  contentType: string;
  imageBase64: string;
  previewUrl: string;
}

interface DraftDetectedItem {
  name: string;
  quantity: number;
}

interface PickupCalendarCell {
  date: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  isToday: boolean;
}

@Component({
  selector: 'app-business-offers-page',
  imports: [DatePipe, ReactiveFormsModule, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './business-offers.html',
  styleUrl: './business-offers.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  protected readonly pickupCalendarMonth = signal(this.startOfMonthString(this.todayDateString()));
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
    this.filterAllergenOptions(this.containsAllergenQuery()),
  );
  protected readonly filteredMayContainAllergenOptions = computed(() =>
    this.filterAllergenOptions(this.mayContainAllergenQuery()),
  );
  protected readonly pickupCalendarMonthLabel = computed(() => {
    const monthDate = this.parseDateOnly(this.pickupCalendarMonth());
    if (!monthDate) {
      return '';
    }

    return new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
    }).format(monthDate);
  });
  protected readonly pickupCalendarDays = computed<PickupCalendarCell[]>(() => {
    const monthDate = this.parseDateOnly(this.pickupCalendarMonth());
    if (!monthDate) {
      return [];
    }

    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const monthIndex = monthStart.getMonth();
    const firstWeekdayIndex = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - firstWeekdayIndex);
    const selectedDate = this.pickupBaseDate();
    const todayDate = this.todayDateString();

    return Array.from({ length: 42 }, (_, index) => {
      const cellDate = new Date(gridStart);
      cellDate.setDate(gridStart.getDate() + index);
      const value = this.formatDateOnly(cellDate);

      return {
        date: value,
        dayOfMonth: cellDate.getDate(),
        isCurrentMonth: cellDate.getMonth() === monthIndex,
        isSelected: value === selectedDate,
        isToday: value === todayDate,
      };
    });
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
    if (!this.statusMetaFor(offer.status).editable) {
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
    this.aiDetectedItems.set(offer.items.map((item) => this.formatDetectedItemLabel(item.name, item.quantity)));
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
    if (!this.statusMetaFor(offer.status).deletable || this.isRemoving(offer.id)) {
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

  protected suggestedCategoryLabel(): string | null {
    const suggestion = this.aiDraftSuggestion();
    return suggestion ? this.formatCategory(suggestion.suggestedCategory) : null;
  }

  protected selectedFinalImageSourceLabel(): string {
    switch (this.finalImageSource()) {
      case 'original-photo':
        return 'Original photo';
      case 'own-upload':
        return 'Upload new image';
      case 'ai-cover':
        return 'AI illustrative cover';
      case 'manual-url':
      default:
        return 'Manual URL / preset';
    }
  }

  protected showFieldError(fieldName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[fieldName];
    return control.invalid && (this.submitAttempted() || control.touched);
  }

  protected showItemFieldError(index: number, fieldName: 'name' | 'quantity'): boolean {
    const control = this.offerItemControls()[index]?.get(fieldName);
    return !!control && control.invalid && (this.submitAttempted() || control.touched);
  }

  protected isPickupWindowInvalid(): boolean {
    const baseDate = this.pickupBaseDate();
    const fromMinutes = this.parseTimeToMinutes(this.pickupFromTime());
    const toMinutes = this.parseTimeToMinutes(this.pickupToTime());

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

  protected statusMetaFor(status: OfferStatus): OfferStatusMeta {
    return OFFER_STATUS_META[status];
  }

  protected resolveOfferImage(offer: OfferModel): string {
    return resolveOfferImage(offer.imageUrl, offer.id);
  }

  protected isRemoving(offerId: number): boolean {
    return this.removingIds().includes(offerId);
  }

  protected formatPrice(price: number): string {
    return `${price.toFixed(2)} EUR`;
  }

  protected hasDiscount(price: number, originalPrice: number | null): boolean {
    return typeof originalPrice === 'number' && originalPrice > price;
  }

  protected discountPercent(price: number, originalPrice: number | null): number | null {
    if (!this.hasDiscount(price, originalPrice) || originalPrice === null) {
      return null;
    }

    return Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  protected offerItemsSummary(offer: OfferModel): string {
    return offer.items.map((item) => `${item.quantity}x ${item.name}`).join(', ');
  }

  protected formatCategory(category: OfferCategory): string {
    return this.categoryOptions.find((option) => option.value === category)?.label ?? category;
  }

  protected formatAllergen(code: AllergenCode): string {
    return formatAllergenLabel(code);
  }

  protected hasAllergen(controlName: 'containsAllergens' | 'mayContainAllergens', code: AllergenCode): boolean {
    return this.form.controls[controlName].value.includes(code);
  }

  protected toggleContainsAllergen(code: AllergenCode): void {
    this.toggleAllergenSelection('containsAllergens', 'mayContainAllergens', code);
  }

  protected toggleMayContainAllergen(code: AllergenCode): void {
    this.toggleAllergenSelection('mayContainAllergens', 'containsAllergens', code);
  }

  protected selectedAllergenOptions(controlName: 'containsAllergens' | 'mayContainAllergens'): AllergenOption[] {
    const selectedValues = new Set(this.form.controls[controlName].value);
    return this.allergenOptions.filter((option) => selectedValues.has(option.value));
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

  protected isEditorStep(step: OfferEditorStep): boolean {
    return this.editorCurrentStep() === step;
  }

  protected editorStepLabel(step: OfferEditorStep): string {
    switch (step) {
      case 'entry':
        return 'Start';
      case 'ai':
        return 'AI draft';
      case 'details':
        return 'Offer setup';
      case 'operations':
        return 'Pickup and image';
    }
  }

  protected canGoToEditorStep(step: OfferEditorStep): boolean {
    return this.visibleEditorSteps().includes(step);
  }

  protected goToEditorStep(step: OfferEditorStep): void {
    if (!this.canGoToEditorStep(step)) {
      return;
    }

    this.editorCurrentStep.set(step);
  }

  protected canGoBackStep(): boolean {
    return this.visibleEditorSteps().indexOf(this.editorCurrentStep()) > 0;
  }

  protected goToPreviousStep(): void {
    const visibleSteps = this.visibleEditorSteps();
    const currentIndex = visibleSteps.indexOf(this.editorCurrentStep());
    if (currentIndex <= 0) {
      return;
    }

    this.editorCurrentStep.set(visibleSteps[currentIndex - 1]);
  }

  protected canGoToNextStep(): boolean {
    if (!this.shouldShowPrimaryEditorAction()) {
      return false;
    }

    const visibleSteps = this.visibleEditorSteps();
    const currentIndex = visibleSteps.indexOf(this.editorCurrentStep());
    return currentIndex >= 0 && currentIndex < visibleSteps.length - 1;
  }

  protected goToNextStep(): void {
    if (!this.shouldShowPrimaryEditorAction()) {
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

  protected isFinalEditorStep(): boolean {
    if (!this.shouldShowPrimaryEditorAction()) {
      return false;
    }

    const visibleSteps = this.visibleEditorSteps();
    return visibleSteps[visibleSteps.length - 1] === this.editorCurrentStep();
  }

  protected shouldShowEditorWizard(): boolean {
    return this.isEditorMode();
  }

  protected editorWizardStatusLabel(): string {
    if (this.mode() === 'create' && this.editorCurrentStep() === 'entry') {
      return 'Choose how you want to start';
    }

    return this.editorStatusLabel();
  }

  protected shouldShowPrimaryEditorAction(): boolean {
    return !(this.mode() === 'create' && this.editorCurrentStep() === 'entry' && this.editorFlowChoice() === 'undecided');
  }

  protected nextEditorActionLabel(): string {
    const visibleSteps = this.visibleEditorSteps();
    const currentIndex = visibleSteps.indexOf(this.editorCurrentStep());
    const nextStep = currentIndex >= 0 ? visibleSteps[currentIndex + 1] : null;

    switch (nextStep) {
      case 'ai':
        return 'Continue to AI draft';
      case 'details':
        return 'Continue to offer setup';
      case 'operations':
        return 'Continue to pickup and image';
      default:
        return 'Continue';
    }
  }

  protected pickupBaseDateValue(): string {
    return this.pickupBaseDate();
  }

  protected pickupBaseDateLabel(): string {
    const value = this.pickupBaseDate();
    if (!value) {
      return 'Choose pickup day';
    }

    const parsedDate = this.parseDateOnly(value);
    if (!parsedDate) {
      return 'Choose pickup day';
    }

    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(parsedDate);
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
    const currentMonth = this.parseDateOnly(this.pickupCalendarMonth()) ?? this.parseDateOnly(this.todayDateString());
    if (!currentMonth) {
      return;
    }

    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
    this.pickupCalendarMonth.set(this.formatDateOnly(nextMonth));
  }

  protected selectPickupRelativeDate(offsetDays: number): void {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + offsetDays);
    this.selectPickupDate(this.formatDateOnly(nextDate));
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
    const value = this.pickupTimeValue(fieldName);
    if (!/^\d{2}:\d{2}$/.test(value)) {
      return null;
    }

    const [hour, minute] = value.split(':');
    return part === 'hour' ? hour : minute;
  }

  protected selectPickupTimePart(fieldName: PickupTimeFieldName, part: 'hour' | 'minute', value: string): void {
    const fallbackTime = this.defaultPickupTimeForField(fieldName);
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
    const fromMinutes = this.parseTimeToMinutes(this.pickupFromTime());
    const toMinutes = this.parseTimeToMinutes(this.pickupToTime());

    if (fromMinutes === null || toMinutes === null) {
      return false;
    }

    return toMinutes < fromMinutes;
  }

  protected pickupWindowSummary(): string | null {
    const baseDate = this.pickupBaseDate();
    const fromTime = this.pickupFromTime();
    const toTime = this.pickupToTime();

    if (!baseDate || !fromTime || !toTime) {
      return null;
    }

    const from = new Date(`${baseDate}T${fromTime}`);
    const toDate = this.pickupWindowRollsToNextDay() ? this.addDaysToDateString(baseDate, 1) : baseDate;
    const to = new Date(`${toDate}T${toTime}`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return null;
    }

    const sameDay = from.toDateString() === to.toDateString();
    const dateFormatter = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const timeFormatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    if (sameDay) {
      return `${dateFormatter.format(from)}, ${timeFormatter.format(from)} - ${timeFormatter.format(to)}`;
    }

    return `${dateFormatter.format(from)}, ${timeFormatter.format(from)} - ${dateFormatter.format(to)}, ${timeFormatter.format(to)}`;
  }

  protected selectedSourceIs(source: OfferFinalImageSource): boolean {
    return this.finalImageSource() === source;
  }

  protected hasOriginalPhoto(): boolean {
    return !!this.originalPhotoAsset();
  }

  protected hasOwnUploadedImage(): boolean {
    return !!this.ownImageAsset();
  }

  protected hasAiCover(): boolean {
    return !!this.aiCoverAsset();
  }

  protected usesBusinessProfileAddress(): boolean {
    return this.form.controls.useBusinessProfileAddress.value;
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
        from: this.toIsoString(rawValue.pickupFrom),
        to: this.toIsoString(rawValue.pickupTo),
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
      useBusinessProfileAddress: this.matchesBusinessProfileAddress(offer.pickupLocation.address, business?.address ?? null),
      pickupStreet: offer.pickupLocation.address.street,
      pickupCity: offer.pickupLocation.address.city,
      pickupPostalCode: offer.pickupLocation.address.postalCode,
      pickupCountry: offer.pickupLocation.address.country,
      pickupNote: offer.pickupLocation.note ?? '',
      pickupFrom: this.toDateTimeLocalValue(offer.pickupTimeWindow.from),
      pickupTo: this.toDateTimeLocalValue(offer.pickupTimeWindow.to),
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

  private toDateTimeLocalValue(value: string): string {
    const parsedValue = new Date(value);
    if (Number.isNaN(parsedValue.getTime())) {
      return '';
    }

    const localDate = new Date(parsedValue.getTime() - parsedValue.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 16);
  }

  private toIsoString(value: string): string {
    return new Date(value).toISOString();
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
      .map((item) => this.parseDetectedItemLabel(item))
      .filter((item) => !!item.name.trim());

    this.aiDetectedItems.set(detectedItems.map((item) => this.formatDetectedItemLabel(item.name, item.quantity)));

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
      .map((item) => this.formatDetectedItemLabel(item.name.trim(), item.quantity))
      .filter((item) => !!item.trim());
  }

  private parseDetectedItemLabel(value: string): DraftDetectedItem {
    const normalizedValue = value.trim();
    const trailingCountMatch = normalizedValue.match(/^(.+?)\s*[x×]\s*(\d{1,2})$/i);
    if (trailingCountMatch) {
      return {
        name: trailingCountMatch[1].trim(),
        quantity: this.normalizeDetectedItemQuantity(Number.parseInt(trailingCountMatch[2], 10)),
      };
    }

    const leadingCountMatch = normalizedValue.match(/^(\d{1,2})\s*[x×]\s*(.+)$/i);
    if (leadingCountMatch) {
      return {
        name: leadingCountMatch[2].trim(),
        quantity: this.normalizeDetectedItemQuantity(Number.parseInt(leadingCountMatch[1], 10)),
      };
    }

    return {
      name: normalizedValue,
      quantity: 1,
    };
  }

  private normalizeDetectedItemQuantity(quantity: number): number {
    if (!Number.isFinite(quantity) || quantity < 1) {
      return 1;
    }

    return Math.min(99, Math.trunc(quantity));
  }

  private formatDetectedItemLabel(name: string, quantity: number): string {
    const normalizedName = name.trim();
    if (!normalizedName) {
      return '';
    }

    return quantity > 1 ? `${normalizedName} x${quantity}` : normalizedName;
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

    targetControl.setValue(this.sortAllergens(cleanedCurrentValues));
    otherControl.setValue(otherValues.filter((value) => value !== code));
    targetControl.markAsDirty();
    targetControl.markAsTouched();
    otherControl.markAsDirty();
    otherControl.markAsTouched();
  }

  private filterAllergenOptions(query: string): AllergenOption[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return this.allergenOptions;
    }

    return this.allergenOptions.filter((option) => option.label.toLowerCase().includes(normalizedQuery));
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
    const pickupFromParts = this.parseDateTimeLocalParts(this.form.controls.pickupFrom.value);
    const pickupToParts = this.parseDateTimeLocalParts(this.form.controls.pickupTo.value);

    this.pickupBaseDate.set(pickupFromParts.date);
    this.pickupFromTime.set(pickupFromParts.time);
    this.pickupToTime.set(pickupToParts.time);
    this.syncPickupCalendarMonth(pickupFromParts.date);
  }

  private parseDateTimeLocalParts(value: string): { date: string; time: string } {
    if (!value) {
      return { date: '', time: '' };
    }

    const [datePart = '', timePart = ''] = value.split('T');
    return { date: datePart, time: timePart.slice(0, 5) };
  }

  private syncPickupControlsFromState(): void {
    const baseDate = this.pickupBaseDate();
    const fromTime = this.pickupFromTime();
    const toTime = this.pickupToTime();

    const pickupFromValue = baseDate && fromTime ? `${baseDate}T${fromTime}` : '';
    const pickupToDate = this.pickupWindowRollsToNextDay() ? this.addDaysToDateString(baseDate, 1) : baseDate;
    const pickupToValue = baseDate && toTime ? `${pickupToDate}T${toTime}` : '';
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

  private parseTimeToMinutes(value: string): number | null {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) {
      return null;
    }

    const [hours, minutes] = value.split(':').map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    return hours * 60 + minutes;
  }

  private addDaysToDateString(value: string, days: number): string {
    if (!value) {
      return value;
    }

    const parsedDate = this.parseDateOnly(value);
    if (!parsedDate) {
      return value;
    }

    parsedDate.setDate(parsedDate.getDate() + days);
    return this.formatDateOnly(parsedDate);
  }

  private sortAllergens(values: AllergenCode[]): AllergenCode[] {
    const orderMap = new Map<AllergenCode, number>(
      this.allergenOptions.map((option, index) => [option.value, index] satisfies [AllergenCode, number]),
    );

    return [...new Set(values)].sort((left, right) => (orderMap.get(left) ?? 999) - (orderMap.get(right) ?? 999));
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
    this.pickupCalendarMonth.set(this.startOfMonthString(value || this.todayDateString()));
  }

  private defaultPickupTimeForField(fieldName: PickupTimeFieldName): string {
    const currentValue = this.pickupTimeValue(fieldName);
    if (currentValue) {
      return currentValue;
    }

    const relatedValue = fieldName === 'pickupFrom' ? this.pickupToTime() : this.pickupFromTime();
    if (relatedValue) {
      return relatedValue;
    }

    return fieldName === 'pickupFrom' ? '10:00' : '12:00';
  }

  private todayDateString(): string {
    return this.formatDateOnly(new Date());
  }

  private startOfMonthString(value: string): string {
    const parsedDate = this.parseDateOnly(value) ?? new Date();
    return this.formatDateOnly(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
  }

  private parseDateOnly(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = Number.parseInt(match[1], 10);
    const monthIndex = Number.parseInt(match[2], 10) - 1;
    const day = Number.parseInt(match[3], 10);
    const parsedDate = new Date(year, monthIndex, day);

    return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  private formatDateOnly(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private matchesBusinessProfileAddress(address: AddressModel, businessAddress: AddressModel | null): boolean {
    if (!businessAddress) {
      return false;
    }

    return address.street === businessAddress.street
      && address.city === businessAddress.city
      && address.postalCode === businessAddress.postalCode
      && address.country === businessAddress.country;
  }
}
