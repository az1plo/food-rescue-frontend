import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { BUSINESS_STATUS_META, BusinessWorkspaceListItem } from '../../../business/models/business.model';
import { appIcons } from '../../../../shared/icons/app-icons';
import { ActionButtonComponent } from '../../../../shared/ui/action-button/action-button';

const BUSINESS_CARD_IMAGES = [
  '/images/offer-bakery.png',
  '/images/offer-sushi.png',
  '/images/offer-salad.png',
  '/images/offer-bagels.png',
] as const;

@Component({
  selector: 'app-business-card',
  imports: [DatePipe, FontAwesomeModule, ActionButtonComponent],
  templateUrl: './business-card.html',
  styleUrl: './business-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessCardComponent {
  readonly business = input.required<BusinessWorkspaceListItem>();

  protected readonly icons = appIcons;
  protected readonly statusMeta = computed(() => BUSINESS_STATUS_META[this.business().status]);
  protected readonly previewImage = computed(
    () => BUSINESS_CARD_IMAGES[(this.business().id - 1) % BUSINESS_CARD_IMAGES.length],
  );
  protected readonly addressLine = computed(() => {
    const business = this.business();
    return `${business.address.street}, ${business.address.city}, ${business.address.country}`;
  });
}
