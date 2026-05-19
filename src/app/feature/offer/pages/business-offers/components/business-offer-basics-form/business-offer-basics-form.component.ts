import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { OfferCategoryOption } from '../../../../models/offer.model';

@Component({
  selector: 'app-business-offer-basics-form',
  imports: [ReactiveFormsModule],
  templateUrl: './business-offer-basics-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferBasicsFormComponent {
  readonly form = input.required<FormGroup>();
  readonly categoryOptions = input.required<readonly OfferCategoryOption[]>();
  readonly titleMaxLength = input.required<number>();
  readonly descriptionMaxLength = input.required<number>();
  readonly submitAttempted = input(false);

  protected showFieldError(fieldName: 'title' | 'description'): boolean {
    const control = this.form().get(fieldName);
    return !!control && control.invalid && (this.submitAttempted() || control.touched);
  }
}
