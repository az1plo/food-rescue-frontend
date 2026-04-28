import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationService } from '../../../../core/services/notification.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';
import { BUSINESS_STATUS_META, BusinessModel } from '../../../business/models/business.model';
import {
  CreateOfferPayload,
  LOCAL_OFFER_IMAGE_OPTIONS,
  OFFER_STATUS_META,
  OfferImageOption,
  OfferItemModel,
  OfferModel,
  OfferPayload,
  OfferStatus,
  OfferStatusMeta,
  resolveOfferImage,
} from '../../models/offer.model';
import { OfferApiService } from '../../services/offer-api.service';

type OfferEditorMode = 'view' | 'create' | 'edit';

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
  private readonly notificationService = inject(NotificationService);

  protected readonly icons = appIcons;
  protected readonly imageOptions = LOCAL_OFFER_IMAGE_OPTIONS;
  protected readonly countries = ['Slovakia', 'Czechia', 'Austria', 'Hungary', 'Poland'];
  protected readonly business = signal<BusinessModel | null>(null);
  protected readonly offers = signal<OfferModel[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly submitAttempted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly selectedOfferId = signal<number | null>(null);
  protected readonly mode = signal<OfferEditorMode>('view');
  protected readonly removingIds = signal<number[]>([]);

  protected readonly selectedOffer = computed(
    () => this.offers().find((offer) => offer.id === this.selectedOfferId()) ?? null,
  );
  protected readonly businessStatusMeta = computed(() =>
    this.business() ? BUSINESS_STATUS_META[this.business()!.status] : null,
  );
  protected readonly canCreateOffer = computed(() => this.businessStatusMeta()?.offerCreationAllowed ?? false);
  protected readonly offerCount = computed(() => this.offers().length);
  protected readonly editorTitle = computed(() => {
    if (this.mode() === 'create') {
      return 'Create offer';
    }

    if (this.mode() === 'edit') {
      return this.selectedOffer()?.title ?? 'Edit offer';
    }

    return this.selectedOffer()?.title ?? 'Offer details';
  });
  protected readonly pageDescription = computed(() => {
    if (this.canCreateOffer()) {
      return 'Create, update, and maintain live rescue offers for this business from one workspace.';
    }

    return 'The business is not active yet, so new offers stay locked. You can still review the catalog setup and prepare image links.';
  });

  protected readonly form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(160)]],
    description: ['', [Validators.maxLength(1000)]],
    imageUrl: ['', [Validators.maxLength(1024)]],
    price: [4.9, [Validators.required, Validators.min(0)]],
    quantityAvailable: [1, [Validators.required, Validators.min(1)]],
    pickupStreet: ['', [Validators.required, Validators.maxLength(255)]],
    pickupCity: ['', [Validators.required, Validators.maxLength(100)]],
    pickupPostalCode: ['', [Validators.required, Validators.maxLength(20)]],
    pickupCountry: ['Slovakia', [Validators.required, Validators.maxLength(100)]],
    pickupNote: ['', [Validators.maxLength(255)]],
    pickupFrom: ['', [Validators.required]],
    pickupTo: ['', [Validators.required]],
    items: this.fb.array([this.createOfferItemGroup()]),
  });

  constructor() {
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

  protected refreshOffers(): void {
    this.loadOffers();
  }

  protected startCreateOffer(): void {
    const business = this.business();
    if (!business || !this.canCreateOffer()) {
      return;
    }

    this.mode.set('create');
    this.selectedOfferId.set(null);
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
    this.form.reset({
      title: '',
      description: '',
      imageUrl: this.imageOptions[0]?.url ?? '',
      price: 4.9,
      quantityAvailable: 1,
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
  }

  protected selectOffer(offerId: number): void {
    this.selectedOfferId.set(offerId);
    this.mode.set('view');
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
  }

  protected startEditOffer(offer: OfferModel): void {
    if (!this.statusMetaFor(offer.status).editable) {
      return;
    }

    this.selectedOfferId.set(offer.id);
    this.mode.set('edit');
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
    this.patchForm(offer);
  }

  protected cancelEditing(): void {
    this.mode.set('view');
    this.submitAttempted.set(false);
    this.errorMessage.set(null);
  }

  protected saveOffer(): void {
    this.submitAttempted.set(true);
    this.errorMessage.set(null);

    if (this.form.invalid || this.isPickupWindowInvalid()) {
      return;
    }

    const business = this.business();
    if (!business) {
      return;
    }

    const payload = this.buildPayload();
    this.saving.set(true);

    if (this.mode() === 'create') {
      const createPayload: CreateOfferPayload = {
        businessId: business.id,
        ...payload,
      };

      this.offerApi.createOffer(createPayload).subscribe({
        next: () => {
          this.saving.set(false);
          this.mode.set('view');
          this.notificationService.success('Offer was created successfully.', 'Offer saved');
          this.loadOffers();
        },
        error: () => {
          this.saving.set(false);
          this.errorMessage.set('We could not create the offer right now. Please try again.');
          this.notificationService.error('Offer could not be created.');
        },
      });
      return;
    }

    const offer = this.selectedOffer();
    if (!offer) {
      this.saving.set(false);
      return;
    }

    this.offerApi.updateOffer(offer.id, payload).subscribe({
      next: (updatedOffer) => {
        this.saving.set(false);
        this.mode.set('view');
        this.offers.update((offers) =>
          offers.map((existingOffer) => (existingOffer.id === updatedOffer.id ? updatedOffer : existingOffer)),
        );
        this.selectedOfferId.set(updatedOffer.id);
        this.notificationService.success('Offer details were updated.', 'Offer saved');
      },
      error: () => {
        this.saving.set(false);
        this.errorMessage.set('We could not save the offer changes right now. Please try again.');
        this.notificationService.error('Offer changes could not be saved.');
      },
    });
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
    this.form.controls.imageUrl.setValue(option.url);
  }

  protected offerItemControls(): FormGroup[] {
    return this.offerItemsArray().controls as FormGroup[];
  }

  protected showFieldError(fieldName: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[fieldName];
    return this.submitAttempted() && control.invalid;
  }

  protected showItemFieldError(index: number, fieldName: 'name' | 'quantity'): boolean {
    const control = this.offerItemControls()[index]?.get(fieldName);
    return !!control && this.submitAttempted() && control.invalid;
  }

  protected isPickupWindowInvalid(): boolean {
    const { pickupFrom, pickupTo } = this.form.getRawValue();

    if (!pickupFrom || !pickupTo) {
      return false;
    }

    return new Date(pickupFrom).getTime() >= new Date(pickupTo).getTime();
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

  protected offerItemsSummary(offer: OfferModel): string {
    return offer.items.map((item) => `${item.quantity}x ${item.name}`).join(', ');
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

  private buildPayload(): OfferPayload {
    const rawValue = this.form.getRawValue();

    return {
      title: rawValue.title.trim(),
      description: rawValue.description.trim() || null,
      imageUrl: rawValue.imageUrl.trim() || null,
      price: rawValue.price,
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
    this.form.reset({
      title: offer.title,
      description: offer.description ?? '',
      imageUrl: offer.imageUrl ?? '',
      price: offer.price,
      quantityAvailable: offer.quantityAvailable,
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
}
