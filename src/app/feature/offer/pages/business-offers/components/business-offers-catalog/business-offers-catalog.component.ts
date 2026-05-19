import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../../../shared/ui/action-button/action-button';
import { OfferModel } from '../../../../models/offer.model';
import {
  businessOfferStatusMeta,
  formatBusinessOfferCategory,
  formatBusinessOfferPrice,
  hasBusinessOfferDiscount,
  resolveBusinessOfferImage,
  summarizeBusinessOfferItems,
} from '../../business-offers-presenter.utils';

@Component({
  selector: 'app-business-offers-catalog',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './business-offers-catalog.component.html',
  styleUrl: './business-offers-catalog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessOffersCatalogComponent {
  readonly icons = input.required<typeof appIcons>();
  readonly offers = input.required<readonly OfferModel[]>();
  readonly selectedOfferId = input<number | null>(null);
  readonly canCreateOffer = input(false);
  readonly removingIds = input.required<readonly number[]>();
  readonly offerSelected = output<number>();
  readonly offerEditRequested = output<OfferModel>();
  readonly offerDeleteRequested = output<OfferModel>();

  protected readonly offerCount = computed(() => this.offers().length);

  protected readonly statusMetaFor = businessOfferStatusMeta;
  protected readonly resolveOfferImage = resolveBusinessOfferImage;
  protected readonly formatPrice = formatBusinessOfferPrice;
  protected readonly hasDiscount = hasBusinessOfferDiscount;
  protected readonly formatCategory = formatBusinessOfferCategory;
  protected readonly offerItemsSummary = summarizeBusinessOfferItems;

  protected isRemoving(offerId: number): boolean {
    return this.removingIds().includes(offerId);
  }
}
