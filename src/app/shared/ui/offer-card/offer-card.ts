import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { resolveBusinessIconUrl } from '../../../feature/business/models/business.model';
import { appIcons } from '../../icons/app-icons';
import { OfferCardModel, OfferCardVariant } from './offer-card.models';
import { buildOfferBusinessMark } from './offer-card.utils';

@Component({
  selector: 'app-offer-card',
  imports: [FontAwesomeModule],
  templateUrl: './offer-card.html',
  styleUrl: './offer-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OfferCardComponent {
  readonly card = input.required<OfferCardModel>();
  readonly variant = input<OfferCardVariant>('list');
  readonly clickable = input(false);
  readonly showBadge = input(true);
  readonly showCartButton = input(false);
  readonly showBusinessInfo = input(true);
  readonly showPickup = input(true);
  readonly showDistance = input(true);
  readonly showDescription = input(false);
  readonly showPrice = input(true);
  readonly showOriginalPrice = input(true);
  readonly showRating = input(true);
  readonly showRatingIcon = input(true);
  readonly interactiveBadge = input(false);
  readonly cartAriaLabel = input('Toggle cart');
  readonly badgeAriaLabel = input('Open offer details');
  readonly cardPressed = output<void>();
  readonly badgePressed = output<void>();
  readonly cartPressed = output<void>();

  protected readonly icons = appIcons;
  protected readonly status = computed(() => this.card().status ?? 'AVAILABLE');
  protected readonly isInCart = computed(() => this.card().inCart ?? false);
  protected readonly isSelected = computed(() => this.card().selected ?? false);
  protected readonly hasBadge = computed(() => Boolean(this.showBadge() && this.card().availabilityLabel));
  protected readonly hasMediaTop = computed(() => this.showCartButton() || this.hasBadge());
  protected readonly hasFooter = computed(() => this.showPrice() || (this.showRating() && Boolean(this.card().rating)));
  protected readonly brandImageUrl = computed(() => resolveBusinessIconUrl(this.card().brandImageUrl));
  protected readonly brandMark = computed(() => {
    const explicitBrandMark = this.card().brandMark?.trim();
    if (explicitBrandMark) {
      return explicitBrandMark.slice(0, 2).toUpperCase();
    }

    return buildOfferBusinessMark(this.card().businessName);
  });

  protected handleCardClick(): void {
    if (!this.clickable()) {
      return;
    }

    this.cardPressed.emit();
  }

  protected handleCardKeydown(event: KeyboardEvent): void {
    if (!this.clickable() || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    this.cardPressed.emit();
  }

  protected handleBadgeClick(event: MouseEvent): void {
    event.stopPropagation();
    this.badgePressed.emit();
  }

  protected handleCartClick(event: MouseEvent): void {
    event.stopPropagation();
    this.cartPressed.emit();
  }

  protected stopCardKeyboardEvent(event: KeyboardEvent): void {
    event.stopPropagation();
  }
}
