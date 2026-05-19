import { ChangeDetectionStrategy, Component, HostListener, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NotificationInboxService } from '../../../../core/services/notification-inbox.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { UserService } from '../../../../core/services/user.service';
import { appIcons } from '../../../../shared/icons/app-icons';
import { MarketplaceOfferModel } from '../../../../shared/models/marketplace-offer.model';
import { CartFacade } from './cart.facade';
import { OfferCheckoutService } from '../../services/offer-checkout.service';

@Component({
  selector: 'app-cart-page',
  imports: [FontAwesomeModule],
  providers: [CartFacade],
  templateUrl: './cart.html',
  styleUrl: './cart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartPage {
  private readonly router = inject(Router);
  private readonly cartFacade = inject(CartFacade);
  private readonly offerCheckout = inject(OfferCheckoutService);
  private readonly notificationInbox = inject(NotificationInboxService);
  private readonly notificationService = inject(NotificationService);
  private readonly userService = inject(UserService);

  protected readonly icons = appIcons;
  protected readonly user = this.userService.getUser();
  protected readonly cartItems = this.cartFacade.cartItems;
  protected readonly loading = this.cartFacade.loading;
  protected readonly errorMessage = this.cartFacade.errorMessage;
  protected readonly offers = this.cartFacade.offers;
  protected readonly cartEntries = this.cartFacade.cartEntries;
  protected readonly checkoutReadyEntries = this.cartFacade.checkoutReadyEntries;
  protected readonly subtotal = this.cartFacade.subtotal;
  protected readonly serviceFee = this.cartFacade.serviceFee;
  protected readonly estimatedTax = this.cartFacade.estimatedTax;
  protected readonly checkoutItemCount = this.cartFacade.checkoutItemCount;
  protected readonly totalSavings = this.cartFacade.totalSavings;
  protected readonly checkoutGrandTotal = this.cartFacade.checkoutGrandTotal;
  protected readonly checkoutOriginalTotal = this.cartFacade.checkoutOriginalTotal;
  protected readonly hasBlockingLoadError = this.cartFacade.hasBlockingLoadError;
  protected readonly pickupScheduleEntries = this.cartFacade.pickupScheduleEntries;
  protected readonly suggestedOffers = this.cartFacade.suggestedOffers;
  protected readonly checkoutModalOpen = signal(false);
  protected readonly cardHolderName = signal('');
  protected readonly cardLast4 = signal('');
  protected readonly cardDigitsCount = signal(0);
  protected readonly cardExpiry = signal('');
  protected readonly processingCheckout = signal(false);
  protected readonly loadingSkeletonIds = this.cartFacade.loadingSkeletonIds;

  protected readonly updateEntryQuantity = this.cartFacade.updateEntryQuantity.bind(this.cartFacade);
  protected readonly formatPrice = this.cartFacade.formatPrice.bind(this.cartFacade);
  protected readonly hasDiscount = this.cartFacade.hasDiscount.bind(this.cartFacade);
  protected readonly discountPercent = this.cartFacade.discountPercent.bind(this.cartFacade);
  protected readonly formatOfferPickupWindow = this.cartFacade.formatOfferPickupWindow.bind(this.cartFacade);
  protected readonly cartEntryStatusLabel = this.cartFacade.cartEntryStatusLabel.bind(this.cartFacade);
  protected readonly resolveOfferImage = this.cartFacade.resolveOfferImage.bind(this.cartFacade);
  protected readonly businessInitials = this.cartFacade.businessInitials.bind(this.cartFacade);
  protected readonly businessIconUrl = this.cartFacade.businessIconUrl.bind(this.cartFacade);
  protected readonly businessLocationLabel = this.cartFacade.businessLocationLabel.bind(this.cartFacade);
  protected readonly formatRating = this.cartFacade.formatRating.bind(this.cartFacade);
  protected readonly selectedQuantity = this.cartFacade.selectedQuantity.bind(this.cartFacade);
  protected readonly quantityOptions = this.cartFacade.quantityOptions.bind(this.cartFacade);
  protected readonly availabilityLabel = this.cartFacade.availabilityLabel.bind(this.cartFacade);
  protected readonly entryPriceTotal = this.cartFacade.entryPriceTotal.bind(this.cartFacade);
  protected readonly entryOriginalPriceTotal = this.cartFacade.entryOriginalPriceTotal.bind(this.cartFacade);
  protected readonly isOfferReadyForCheckout = this.cartFacade.isOfferReadyForCheckout.bind(this.cartFacade);
  protected readonly isOwnBusinessOffer = this.cartFacade.isOwnBusinessOffer.bind(this.cartFacade);

  constructor() {
    effect(() => {
      if (!this.cartItems().length || !this.checkoutReadyEntries().length || !this.user()) {
        this.closeCheckoutModal();
      }
    });
  }

  @HostListener('document:keydown.escape')
  protected handleEscapeKey(): void {
    if (this.checkoutModalOpen()) {
      this.closeCheckoutModal();
    }
  }

  protected continueBrowsing(): void {
    void this.router.navigateByUrl('/browse-offers');
  }

  protected openOfferDetails(offer: MarketplaceOfferModel): void {
    void this.router.navigate(['/browse-offers', offer.id]);
  }

  protected addSuggestedOffer(offer: MarketplaceOfferModel, event: Event): void {
    event.stopPropagation();

    if (this.isOwnBusinessOffer(offer)) {
      this.notificationService.info('You cannot reserve offers from your own business.', 'Offer unavailable');
      return;
    }

    if (this.cartFacade.hasOffer(offer.id)) {
      this.notificationService.info(`"${offer.title}" is already in your cart.`, 'Cart updated');
      return;
    }

    this.cartFacade.addOffer(offer.id);
    this.notificationService.success(`"${offer.title}" was added to your cart.`, 'Saved for later');
  }

  protected removeOffer(offerId: number): void {
    this.cartFacade.removeOffer(offerId);
    this.notificationService.info('Offer removed from your cart.', 'Cart updated');
  }

  protected clearCart(): void {
    this.closeCheckoutModal();
    this.cartFacade.clearCart();
    this.notificationService.info('Your cart is now empty.', 'Cart cleared');
  }

  protected updateCardHolderName(value: string): void {
    this.cardHolderName.set(value);
  }

  protected updateCardNumber(input: HTMLInputElement): void {
    const digits = input.value.replace(/\D/g, '').slice(0, 16);
    input.value = digits.replace(/(.{4})/g, '$1 ').trim();
    this.cardLast4.set(digits.slice(-4));
    this.cardDigitsCount.set(digits.length);
  }

  protected updateCardExpiry(value: string): void {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    this.cardExpiry.set(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits);
  }

  protected checkoutFieldsDisabled(): boolean {
    return this.processingCheckout() || !this.user();
  }

  protected canStartCheckout(): boolean {
    return !this.processingCheckout() && !!this.checkoutReadyEntries().length;
  }

  protected canConfirmCheckout(): boolean {
    return this.canStartCheckout() && !!this.user() && this.hasPaymentDetails();
  }

  protected checkoutConfirmLabel(): string {
    return this.processingCheckout() ? 'Processing payment...' : 'Confirm and reserve';
  }

  protected async openCheckoutModal(): Promise<void> {
    if (this.processingCheckout()) {
      return;
    }

    if (!this.checkoutReadyEntries().length) {
      this.notificationService.info('No offers are ready for checkout right now.', 'Cart updated');
      return;
    }

    if (!this.user()) {
      await this.userService.login('/cart');
      return;
    }

    this.checkoutModalOpen.set(true);
  }

  protected closeCheckoutModal(): void {
    if (this.processingCheckout()) {
      return;
    }

    this.checkoutModalOpen.set(false);
    this.resetCheckoutDraft();
  }

  protected async simulateCheckout(): Promise<void> {
    if (this.processingCheckout()) {
      return;
    }

    if (!this.checkoutReadyEntries().length) {
      this.notificationService.info('No offers are ready for checkout right now.', 'Cart updated');
      this.closeCheckoutModal();
      return;
    }

    if (!this.user()) {
      this.closeCheckoutModal();
      await this.userService.login('/cart');
      return;
    }

    if (!this.hasPaymentDetails()) {
      this.notificationService.info(
        'Add a cardholder name and at least the last four card digits to continue to payment.',
        'Payment details needed',
      );
      return;
    }

    this.processingCheckout.set(true);
    this.errorMessage.set(null);
    const readyEntries = this.checkoutReadyEntries();
    const checkoutResult = await this.offerCheckout.checkoutOffers(
      readyEntries.map((entry) => ({
        offerId: entry.offer.id,
        quantity: this.selectedQuantity(entry.offer.id, entry.offer),
      })),
      {
        cardHolderName: this.cardHolderName().trim(),
        cardLast4: this.cardLast4(),
      },
    );

    this.processingCheckout.set(false);
    this.notificationInbox.refresh();

    if (checkoutResult.completedOfferIds.length) {
      this.closeCheckoutModal();

      for (const offerId of checkoutResult.completedOfferIds) {
        this.cartFacade.removeOffer(offerId);
      }

      this.notificationService.success(
        `${checkoutResult.completedOfferIds.length} ${checkoutResult.completedOfferIds.length === 1 ? 'order is' : 'orders are'} paid successfully. Pickup passes are now ready in My pickups.`,
        'Payment accepted',
      );
      void this.router.navigateByUrl('/my-pickups');
    }

    if (checkoutResult.failedOfferIds.length) {
      this.notificationService.error(
        `${checkoutResult.failedOfferIds.length} ${checkoutResult.failedOfferIds.length === 1 ? 'offer could not' : 'offers could not'} be paid. No pickup order was created for those items.`,
        'Checkout incomplete',
      );
    }

    if (checkoutResult.unauthorized) {
      this.closeCheckoutModal();
      await this.userService.login('/cart');
    }
  }

  private hasPaymentDetails(): boolean {
    return this.cardHolderName().trim().length >= 2 && this.cardLast4().length >= 4 && this.cardDigitsCount() >= 4;
  }

  private resetCheckoutDraft(): void {
    this.cardHolderName.set('');
    this.cardLast4.set('');
    this.cardDigitsCount.set(0);
    this.cardExpiry.set('');
  }
}
