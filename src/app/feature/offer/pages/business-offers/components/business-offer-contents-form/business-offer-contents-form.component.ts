import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../../../shared/icons/app-icons';

@Component({
  selector: 'app-business-offer-contents-form',
  imports: [ReactiveFormsModule, FontAwesomeModule],
  templateUrl: './business-offer-contents-form.component.html',
  styleUrl: './business-offer-contents-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferContentsFormComponent {
  readonly icons = input.required<typeof appIcons>();
  readonly itemGroups = input.required<readonly FormGroup[]>();
  readonly submitAttempted = input(false);
  readonly itemAdded = output<void>();
  readonly itemRemoved = output<number>();

  protected showItemFieldError(index: number, fieldName: 'name' | 'quantity'): boolean {
    const control = this.itemGroups()[index]?.get(fieldName);
    return !!control && control.invalid && (this.submitAttempted() || control.touched);
  }
}
