import {
  AllergenCode,
  formatAllergenLabel,
  OFFER_CATEGORY_OPTIONS,
  OFFER_STATUS_META,
  OfferCategory,
  OfferModel,
  OfferStatus,
  OfferStatusMeta,
  resolveOfferImage,
} from '../../models/offer.model';
import { OfferEditorStep } from './business-offers.models';

export function businessOfferStatusMeta(status: OfferStatus): OfferStatusMeta {
  return OFFER_STATUS_META[status];
}

export function resolveBusinessOfferImage(offer: OfferModel): string {
  return resolveOfferImage(offer.imageUrl, offer.id);
}

export function formatBusinessOfferPrice(price: number): string {
  return `${price.toFixed(2)} EUR`;
}

export function hasBusinessOfferDiscount(price: number, originalPrice: number | null): boolean {
  return typeof originalPrice === 'number' && originalPrice > price;
}

export function businessOfferDiscountPercent(price: number, originalPrice: number | null): number | null {
  if (!hasBusinessOfferDiscount(price, originalPrice) || originalPrice === null) {
    return null;
  }

  return Math.round(((originalPrice - price) / originalPrice) * 100);
}

export function summarizeBusinessOfferItems(offer: OfferModel): string {
  return offer.items.map((item) => `${item.quantity}x ${item.name}`).join(', ');
}

export function formatBusinessOfferCategory(category: OfferCategory): string {
  return OFFER_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

export function formatBusinessOfferAllergen(code: AllergenCode): string {
  return formatAllergenLabel(code);
}

export function businessOfferEditorStepLabel(step: OfferEditorStep): string {
  switch (step) {
    case 'entry':
      return 'Start';
    case 'ai':
      return 'AI draft';
    case 'details':
      return 'Offer setup';
    case 'operations':
      return 'Pickup and image';
  }
}
