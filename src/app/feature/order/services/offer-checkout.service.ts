import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { OrderApiService } from './order-api.service';

export interface OfferCheckoutItemInput {
  offerId: number;
  quantity: number;
}

export interface OfferCheckoutPaymentInput {
  cardHolderName: string;
  cardLast4: string;
}

export interface OfferCheckoutResult {
  completedOfferIds: number[];
  failedOfferIds: number[];
  unauthorized: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class OfferCheckoutService {
  private readonly orderApi = inject(OrderApiService);

  async checkoutOffers(
    items: readonly OfferCheckoutItemInput[],
    payment: OfferCheckoutPaymentInput,
  ): Promise<OfferCheckoutResult> {
    const completedOfferIds: number[] = [];
    const failedOfferIds: number[] = [];
    let unauthorized = false;

    for (const item of items) {
      try {
        await firstValueFrom(this.orderApi.createOrder({
          offerId: item.offerId,
          quantity: item.quantity,
          cardHolderName: payment.cardHolderName,
          cardLast4: payment.cardLast4,
        }));
        completedOfferIds.push(item.offerId);
      } catch (error: unknown) {
        failedOfferIds.push(item.offerId);

        const status = (error as { status?: number } | undefined)?.status;
        if (status === 401 || status === 403) {
          unauthorized = true;
          break;
        }
      }
    }

    return {
      completedOfferIds,
      failedOfferIds,
      unauthorized,
    };
  }
}
