import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../../../shared/icons/app-icons';
import { OfferImageOption } from '../../../../models/offer.model';
import { EditorImageAsset, OfferFinalImageSource } from './business-offer-image-picker.models';

@Component({
  selector: 'app-business-offer-image-picker',
  imports: [ReactiveFormsModule, FontAwesomeModule],
  templateUrl: './business-offer-image-picker.component.html',
  styleUrl: './business-offer-image-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferImagePickerComponent {
  readonly icons = input.required<typeof appIcons>();
  readonly imageOptions = input.required<readonly OfferImageOption[]>();
  readonly manualImageControl = input.required<FormControl<string>>();
  readonly offerTitle = input('');
  readonly finalImageSource = input.required<OfferFinalImageSource>();
  readonly originalPhotoAsset = input<EditorImageAsset | null>(null);
  readonly ownImageAsset = input<EditorImageAsset | null>(null);
  readonly aiCoverAsset = input<EditorImageAsset | null>(null);
  readonly selectedFinalImagePreview = input<string | null>(null);
  readonly selectedFinalImageIllustrative = input(false);
  readonly generatingCover = input(false);
  readonly canGenerateAiCover = input(false);
  readonly sourceSelected = output<OfferFinalImageSource>();
  readonly manualImageInput = output<void>();
  readonly imagePresetSelected = output<OfferImageOption>();
  readonly originalPhotoRemoved = output<void>();
  readonly ownUploadedImageRemoved = output<void>();
  readonly aiCoverRemoved = output<void>();
  readonly aiCoverGenerationRequested = output<void>();

  protected readonly selectedFinalImageSourceLabel = computed(() => {
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
  });

  protected readonly hasAiCover = computed(() => Boolean(this.aiCoverAsset()));

  protected selectedSourceIs(source: OfferFinalImageSource): boolean {
    return this.finalImageSource() === source;
  }
}
