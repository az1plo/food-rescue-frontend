import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-business-offer-pricing-form',
  imports: [ReactiveFormsModule],
  templateUrl: './business-offer-pricing-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferPricingFormComponent {
  readonly form = input.required<FormGroup>();
  readonly submitAttempted = input(false);

  protected showFieldError(fieldName: 'price' | 'originalPrice' | 'quantityAvailable'): boolean {
    const control = this.form().get(fieldName);
    return !!control && control.invalid && (this.submitAttempted() || control.touched);
  }

  protected isOriginalPriceInvalid(): boolean {
    const price = this.form().get('price')?.value;
    const originalPrice = this.form().get('originalPrice')?.value;
    return originalPrice !== null && originalPrice < price;
  }
}
