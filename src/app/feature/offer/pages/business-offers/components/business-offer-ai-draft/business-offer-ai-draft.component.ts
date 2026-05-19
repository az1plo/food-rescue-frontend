import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../../../shared/icons/app-icons';
import { OfferDraftSuggestionModel } from '../../../../models/offer-assistant.model';
import { formatBusinessOfferCategory } from '../../business-offers-presenter.utils';
import { EditorImageAsset } from '../business-offer-image-picker/business-offer-image-picker.models';

@Component({
  selector: 'app-business-offer-ai-draft',
  imports: [FontAwesomeModule],
  templateUrl: './business-offer-ai-draft.component.html',
  styleUrl: './business-offer-ai-draft.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferAiDraftComponent {
  readonly icons = input.required<typeof appIcons>();
  readonly originalPhotoAsset = input<EditorImageAsset | null>(null);
  readonly draftingFromImage = input(false);
  readonly aiDraftSuggestion = input<OfferDraftSuggestionModel | null>(null);
  readonly visibleDetectedItems = input.required<readonly string[]>();
  readonly hiddenDetectedItemCount = input(0);
  readonly originalPhotoRemoved = output<void>();
  readonly draftRequested = output<void>();

  protected readonly hasOriginalPhoto = computed(() => Boolean(this.originalPhotoAsset()));
  protected readonly suggestedCategoryLabel = computed(() => {
    const suggestion = this.aiDraftSuggestion();
    return suggestion ? formatBusinessOfferCategory(suggestion.suggestedCategory) : null;
  });
}
