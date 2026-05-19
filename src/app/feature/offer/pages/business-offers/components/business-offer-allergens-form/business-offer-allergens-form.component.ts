import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../../../shared/icons/app-icons';
import { AllergenCode, AllergenOption } from '../../../../models/offer.model';

@Component({
  selector: 'app-business-offer-allergens-form',
  imports: [ReactiveFormsModule, FontAwesomeModule],
  templateUrl: './business-offer-allergens-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferAllergensFormComponent {
  readonly icons = input.required<typeof appIcons>();
  readonly form = input.required<FormGroup>();
  readonly allergenOptions = input.required<readonly AllergenOption[]>();
  readonly filteredContainsAllergenOptions = input.required<readonly AllergenOption[]>();
  readonly filteredMayContainAllergenOptions = input.required<readonly AllergenOption[]>();
  readonly containsAllergenQuery = input('');
  readonly mayContainAllergenQuery = input('');
  readonly otherAllergenNoteMaxLength = input.required<number>();
  readonly submitAttempted = input(false);
  readonly containsAllergenQueryChanged = output<string>();
  readonly mayContainAllergenQueryChanged = output<string>();
  readonly containsAllergenToggled = output<AllergenCode>();
  readonly mayContainAllergenToggled = output<AllergenCode>();

  protected hasAllergen(controlName: 'containsAllergens' | 'mayContainAllergens', code: AllergenCode): boolean {
    const selectedValues = this.form().get(controlName)?.value as AllergenCode[] | null;
    return selectedValues?.includes(code) ?? false;
  }

  protected selectedAllergenOptions(controlName: 'containsAllergens' | 'mayContainAllergens'): AllergenOption[] {
    const selectedValues = new Set<AllergenCode>((this.form().get(controlName)?.value as AllergenCode[] | null) ?? []);
    return this.allergenOptions().filter((option) => selectedValues.has(option.value));
  }

  protected showOtherNoteError(): boolean {
    const control = this.form().get('otherAllergenNote');
    return !!control && control.invalid && (this.submitAttempted() || control.touched);
  }
}
