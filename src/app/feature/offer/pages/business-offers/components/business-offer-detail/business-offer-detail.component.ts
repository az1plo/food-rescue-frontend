import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../../../shared/ui/action-button/action-button';
import { OfferModel } from '../../../../models/offer.model';
import {
  businessOfferDiscountPercent,
  businessOfferStatusMeta,
  formatBusinessOfferAllergen,
  formatBusinessOfferCategory,
  formatBusinessOfferPrice,
  hasBusinessOfferDiscount,
  resolveBusinessOfferImage,
} from '../../business-offers-presenter.utils';

@Component({
  selector: 'app-business-offer-detail',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './business-offer-detail.component.html',
  styleUrl: './business-offer-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOfferDetailComponent {
  readonly icons = input.required<typeof appIcons>();
  readonly offer = input<OfferModel | null>(null);
  readonly removingIds = input.required<readonly number[]>();
  readonly offerEditRequested = output<OfferModel>();
  readonly offerDeleteRequested = output<OfferModel>();

  protected readonly statusMetaFor = businessOfferStatusMeta;
  protected readonly resolveOfferImage = resolveBusinessOfferImage;
  protected readonly formatPrice = formatBusinessOfferPrice;
  protected readonly hasDiscount = hasBusinessOfferDiscount;
  protected readonly discountPercent = businessOfferDiscountPercent;
  protected readonly formatCategory = formatBusinessOfferCategory;
  protected readonly formatAllergen = formatBusinessOfferAllergen;

  protected isRemoving(offerId: number): boolean {
    return this.removingIds().includes(offerId);
  }
}
