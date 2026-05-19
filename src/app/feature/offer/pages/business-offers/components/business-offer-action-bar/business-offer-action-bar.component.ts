import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../../../shared/icons/app-icons';
import { OfferEditorFlowChoice, OfferEditorMode, OfferEditorStep } from '../../business-offers.models';

@Component({
  selector: 'app-business-offer-action-bar',
  imports: [FontAwesomeModule],
  templateUrl: './business-offer-action-bar.component.html',
  styleUrl: './business-offer-action-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferActionBarComponent {
  readonly icons = input.required<typeof appIcons>();
  readonly saving = input(false);
  readonly formDirty = input(false);
  readonly mode = input.required<OfferEditorMode>();
  readonly currentStep = input.required<OfferEditorStep>();
  readonly editorFlowChoice = input.required<OfferEditorFlowChoice>();
  readonly visibleSteps = input.required<readonly OfferEditorStep[]>();
  readonly cancelPressed = output<void>();
  readonly previousPressed = output<void>();
  readonly nextPressed = output<void>();
  readonly savePressed = output<void>();

  protected readonly statusTone = computed<'saved' | 'saving' | 'unsaved'>(() => {
    if (this.saving()) {
      return 'saving';
    }

    if (this.formDirty()) {
      return 'unsaved';
    }

    return 'saved';
  });

  protected readonly statusLabel = computed(() => {
    if (this.mode() === 'create' && this.currentStep() === 'entry') {
      return 'Choose how you want to start';
    }

    if (this.saving()) {
      return 'Saving draft...';
    }

    if (this.formDirty()) {
      return 'Unsaved changes';
    }

    return 'Draft ready to save';
  });

  protected readonly showPrimaryAction = computed(() =>
    !(this.mode() === 'create' && this.currentStep() === 'entry' && this.editorFlowChoice() === 'undecided'),
  );

  protected readonly canGoBack = computed(() => this.visibleSteps().indexOf(this.currentStep()) > 0);

  protected readonly isFinalStep = computed(() => {
    if (!this.showPrimaryAction()) {
      return false;
    }

    const visibleSteps = this.visibleSteps();
    return visibleSteps[visibleSteps.length - 1] === this.currentStep();
  });

  protected readonly canGoNext = computed(() => {
    if (!this.showPrimaryAction()) {
      return false;
    }

    const visibleSteps = this.visibleSteps();
    const currentIndex = visibleSteps.indexOf(this.currentStep());
    return currentIndex >= 0 && currentIndex < visibleSteps.length - 1;
  });

  protected readonly nextActionLabel = computed(() => {
    const visibleSteps = this.visibleSteps();
    const currentIndex = visibleSteps.indexOf(this.currentStep());
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
  });
}
