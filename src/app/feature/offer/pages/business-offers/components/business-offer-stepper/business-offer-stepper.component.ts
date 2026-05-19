import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { businessOfferEditorStepLabel } from '../../business-offers-presenter.utils';
import { OfferEditorStep } from '../../business-offers.models';

@Component({
  selector: 'app-business-offer-stepper',
  templateUrl: './business-offer-stepper.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferStepperComponent {
  readonly steps = input.required<readonly OfferEditorStep[]>();
  readonly currentStep = input.required<OfferEditorStep>();
  readonly stepSelected = output<OfferEditorStep>();

  protected readonly labelForStep = businessOfferEditorStepLabel;
}
