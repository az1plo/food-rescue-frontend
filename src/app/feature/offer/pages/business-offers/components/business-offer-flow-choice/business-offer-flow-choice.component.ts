import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../../../shared/icons/app-icons';

@Component({
  selector: 'app-business-offer-flow-choice',
  imports: [FontAwesomeModule],
  templateUrl: './business-offer-flow-choice.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferFlowChoiceComponent {
  readonly icons = input.required<typeof appIcons>();
  readonly aiDraftSelected = output<void>();
  readonly manualSetupSelected = output<void>();
}
