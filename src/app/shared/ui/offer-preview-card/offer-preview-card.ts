import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { appIcons } from '../../icons/app-icons';

export interface OfferPreviewCardModel {
  title: string;
  business: string;
  price: string;
  rating: string;
  distance: string;
  pickup: string;
  image: string;
}

@Component({
  selector: 'app-offer-preview-card',
  imports: [FontAwesomeModule],
  templateUrl: './offer-preview-card.html',
  styleUrl: './offer-preview-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferPreviewCardComponent {
  readonly offer = input.required<OfferPreviewCardModel>();

  protected readonly icons = appIcons;
}
